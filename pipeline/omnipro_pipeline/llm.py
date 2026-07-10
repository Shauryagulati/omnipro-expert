"""Structured LLM calls: force a tool whose input schema is the pydantic model.

Two providers, one behavior:
- Anthropic (default when ANTHROPIC_API_KEY is set) — the canonical path.
- OpenRouter (fallback when only OPENROUTER_API_KEY is set) — same Claude
  model routed through OpenRouter's OpenAI-style API. Dev convenience only;
  the runtime app never uses this.

Validation failures are fed back to the model for up to two retries, so the
pipeline either gets schema-valid data or fails loudly.
"""

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError


def _with_connection_retries(fn, attempts: int = 4):
    """Retry transient connection failures with exponential backoff."""
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — provider SDKs raise different types
            transient = type(e).__name__ in (
                "APIConnectionError",
                "APITimeoutError",
                "InternalServerError",
                "RateLimitError",
                "OverloadedError",
            )
            if not transient or i == attempts - 1:
                raise
            wait = 2**i * 5
            print(f"  transient {type(e).__name__}, retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("unreachable")

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

ANTHROPIC_MODEL = os.environ.get("EXTRACTION_MODEL", "claude-sonnet-5")
OPENROUTER_MODEL = os.environ.get("EXTRACTION_MODEL", "anthropic/claude-sonnet-5")


def provider() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    raise RuntimeError("Set ANTHROPIC_API_KEY (preferred) or OPENROUTER_API_KEY in .env")


def extract_structured(
    system: str,
    user_blocks: list,
    schema_model: type[BaseModel],
    max_retries: int = 2,
    max_tokens: int = 8192,
) -> BaseModel:
    if provider() == "anthropic":
        return _via_anthropic(system, user_blocks, schema_model, max_retries, max_tokens)
    return _via_openrouter(system, user_blocks, schema_model, max_retries, max_tokens)


def _via_anthropic(system, user_blocks, schema_model, max_retries, max_tokens=8192):
    from anthropic import Anthropic

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    tool = {
        "name": "emit",
        "description": "Emit the extraction result.",
        "input_schema": schema_model.model_json_schema(),
    }
    messages = [{"role": "user", "content": user_blocks}]
    for attempt in range(max_retries + 1):
        resp = _with_connection_retries(
            lambda: client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                tools=[tool],
                tool_choice={"type": "tool", "name": "emit"},
            )
        )
        block = next(b for b in resp.content if b.type == "tool_use")
        try:
            return schema_model.model_validate(block.input)
        except ValidationError as e:
            if attempt == max_retries:
                raise
            messages += [
                {"role": "assistant", "content": resp.content},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "is_error": True,
                            "content": f"Validation failed, fix and re-emit: {e}",
                        }
                    ],
                },
            ]
    raise RuntimeError("unreachable")


def _to_openai_content(user_blocks: list) -> list:
    content = []
    for b in user_blocks:
        if b["type"] == "image":
            src = b["source"]
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{src['media_type']};base64,{src['data']}"},
                }
            )
        else:
            content.append({"type": "text", "text": b["text"]})
    return content


def _via_openrouter(system, user_blocks, schema_model, max_retries, max_tokens=8192):
    from openai import OpenAI

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    tool = {
        "type": "function",
        "function": {
            "name": "emit",
            "description": "Emit the extraction result.",
            "parameters": schema_model.model_json_schema(),
        },
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": _to_openai_content(user_blocks)},
    ]
    for attempt in range(max_retries + 1):
        resp = _with_connection_retries(
            lambda: client.chat.completions.create(
                model=OPENROUTER_MODEL,
                max_tokens=max_tokens,
                messages=messages,
                tools=[tool],
                tool_choice={"type": "function", "function": {"name": "emit"}},
            )
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            raise RuntimeError(f"no tool call in response: {msg.content!r:.200}")
        call = msg.tool_calls[0]
        try:
            return schema_model.model_validate(json.loads(call.function.arguments))
        except (ValidationError, json.JSONDecodeError) as e:
            if attempt == max_retries:
                raise
            messages += [
                {"role": "assistant", "content": None, "tool_calls": [call]},
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": f"Validation failed, fix and re-emit: {e}",
                },
            ]
    raise RuntimeError("unreachable")
