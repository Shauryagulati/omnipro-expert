import { spawn, type ChildProcess } from "node:child_process";

export interface AgentResult {
  text: string;
  tools: string[];
  widgets: string[];
  figures: string[];
  pages: number;
}

export async function askAgent(base: string, question: string): Promise<AgentResult> {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out: AgentResult = { text: "", tools: [], widgets: [], figures: [], pages: 0 };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.type === "text") out.text += e.delta;
      else if (e.type === "tool_call") out.tools.push(e.name);
      else if (e.type === "widget") out.widgets.push(e.widget);
      else if (e.type === "figure") out.figures.push(e.figureId);
      else if (e.type === "page") out.pages++;
      else if (e.type === "error") throw new Error(`agent error: ${e.message}`);
    }
  }
  return out;
}

export async function startServer(port: number): Promise<ChildProcess> {
  const server = spawn("npx", ["next", "dev", "-p", String(port)], {
    stdio: "ignore",
    detached: true,
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) return server;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server did not start");
}

export function stopServer(server: ChildProcess): void {
  if (server.pid) process.kill(-server.pid, "SIGTERM");
}
