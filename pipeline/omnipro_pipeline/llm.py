"""Structured LLM calls: force a tool whose input schema is the pydantic model.

Validation failures are fed back to the model for up to two retries, so the
pipeline either gets schema-valid data or fails loudly.
"""

import os
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
MODEL = "claude-sonnet-5"

_client: Anthropic | None = None


def client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def extract_structured(
    system: str,
    user_blocks: list,
    schema_model: type[BaseModel],
    max_retries: int = 2,
) -> BaseModel:
    tool = {
        "name": "emit",
        "description": "Emit the extraction result.",
        "input_schema": schema_model.model_json_schema(),
    }
    messages = [{"role": "user", "content": user_blocks}]
    for attempt in range(max_retries + 1):
        resp = client().messages.create(
            model=MODEL,
            max_tokens=8192,
            system=system,
            messages=messages,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit"},
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
