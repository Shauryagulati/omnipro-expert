import { runAgent, type ChatMessage } from "@/agent/run";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

export const runtime = "nodejs"; // Agent SDK spawns a subprocess — no edge
export const maxDuration = 300;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return Response.json(
      { error: RATE_LIMIT_MESSAGE, retryAfterMin: rate.retryAfterMin },
      { status: 429, headers: { "Retry-After": String((rate.retryAfterMin ?? 60) * 60) } },
    );
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages[] required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(messages)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
