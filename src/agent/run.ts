import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./system-prompt";
import { ALLOWED_TOOLS, buildToolServer, type UiEvent } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; input: unknown }
  | UiEvent
  | { type: "done" }
  | { type: "error"; message: string };

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// The Agent SDK takes one prompt; multi-turn context travels as a transcript.
// Fine at challenge scale — the graph tools, not raw history, carry the facts.
function toPrompt(messages: ChatMessage[]): string {
  const history = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  if (history.length === 0) return last.content;
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
    .join("\n\n");
  return `Conversation so far:\n${transcript}\n\nUser's new message: ${last.content}`;
}

export async function* runAgent(messages: ChatMessage[]): AsyncGenerator<AgentEvent> {
  const pending: UiEvent[] = [];
  const server = buildToolServer((e) => pending.push(e));

  const q = query({
    prompt: toPrompt(messages),
    options: {
      systemPrompt: buildSystemPrompt(),
      model: MODEL,
      mcpServers: { omnipro: server },
      allowedTools: ALLOWED_TOOLS,
      disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"],
      maxTurns: 12,
      includePartialMessages: true,
    },
  });

  try {
    for await (const msg of q) {
      // Drain UI events emitted by tool handlers since the last message.
      while (pending.length > 0) yield pending.shift()!;

      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          yield { type: "text", delta: ev.delta.text };
        }
      } else if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            yield { type: "tool_call", name: block.name, input: block.input };
          }
        }
      } else if (msg.type === "result") {
        while (pending.length > 0) yield pending.shift()!;
        if (msg.subtype !== "success") {
          yield { type: "error", message: `agent ended: ${msg.subtype}` };
        }
      }
    }
    while (pending.length > 0) yield pending.shift()!;
    yield { type: "done" };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
