/**
 * End-to-end smoke test: boots the dev server, runs the evaluators' sample
 * questions plus the trap cases through the REAL agent, and asserts grounded
 * behavior. Costs a few cents of API usage per run.
 *
 *   npm run smoke
 */
import { spawn } from "node:child_process";

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;

interface Check {
  name: string;
  question: string;
  expect: (r: { text: string; tools: string[]; widgets: string[]; figures: string[] }) => string[];
}

const CHECKS: Check[] = [
  {
    name: "duty cycle MIG 200A/240V (sample Q1)",
    question: "What's the duty cycle for MIG welding at 200A on 240V?",
    expect: (r) => {
      const errs: string[] = [];
      if (!/25\s*%/.test(r.text)) errs.push("missing the correct value 25%");
      if (!/\[owner-manual p\.?\s*\d+\]/.test(r.text)) errs.push("missing citation");
      if (!r.tools.some((t) => t.includes("search_graph") || t.includes("traverse")))
        errs.push("did not retrieve from graph");
      return errs;
    },
  },
  {
    name: "flux-cored porosity (sample Q2)",
    question: "I'm getting porosity in my flux-cored welds. What should I check?",
    expect: (r) => {
      const errs: string[] = [];
      if (!/polarity/i.test(r.text)) errs.push("did not surface polarity as a cause");
      if (!/\[(owner-manual|quick-start-guide) p\.?\s*\d+\]/.test(r.text)) errs.push("missing citation");
      return errs;
    },
  },
  {
    name: "TIG polarity + socket (sample Q3)",
    question: "What polarity setup do I need for TIG? Which socket does the ground clamp go in?",
    expect: (r) => {
      const errs: string[] = [];
      if (!/positive/i.test(r.text)) errs.push("ground clamp must go to POSITIVE for TIG");
      if (r.figures.length === 0 && !r.widgets.includes("polarity_diagram"))
        errs.push("showed neither a manual figure nor a polarity diagram");
      return errs;
    },
  },
  {
    name: "TIG aluminum trap (must decline)",
    question: "Can I TIG weld aluminum with this welder?",
    expect: (r) => {
      const errs: string[] = [];
      if (!/\bDC\b|direct current/i.test(r.text)) errs.push("did not explain the DC-only limitation");
      if (!/\bno\b|can't|cannot|isn't|not\b/i.test(r.text.slice(0, 600)))
        errs.push("did not clearly say no");
      return errs;
    },
  },
  {
    name: "ambiguous duty cycle (must ask back)",
    question: "What's my duty cycle?",
    expect: (r) => {
      const errs: string[] = [];
      if (!/\?/.test(r.text)) errs.push("did not ask a clarifying question");
      const claims = r.text.match(/\d+\s*%\s*(?:@|at)\s*\d+\s*A/gi) ?? [];
      if (claims.length > 0 && !/which|what|depends/i.test(r.text))
        errs.push("gave specific numbers without establishing process/voltage");
      return errs;
    },
  },
];

async function ask(question: string) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out = { text: "", tools: [] as string[], widgets: [] as string[], figures: [] as string[] };
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
      else if (e.type === "error") throw new Error(`agent error: ${e.message}`);
    }
  }
  return out;
}

async function waitForServer(tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server did not start");
}

async function main() {
  console.log("starting server...");
  const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    stdio: "ignore",
    detached: true,
  });
  try {
    await waitForServer();
    let failed = 0;
    for (const check of CHECKS) {
      process.stdout.write(`\n▸ ${check.name}\n`);
      try {
        const result = await ask(check.question);
        const errs = check.expect(result);
        if (errs.length === 0) {
          console.log(`  PASS  (tools: ${result.tools.filter((t) => t.includes("omnipro")).length}, widgets: ${result.widgets.join(",") || "-"}, figures: ${result.figures.length})`);
        } else {
          failed++;
          console.log(`  FAIL  ${errs.join(" | ")}`);
          console.log(`  ---\n  ${result.text.slice(0, 400).replace(/\n/g, "\n  ")}\n  ---`);
        }
      } catch (err) {
        failed++;
        console.log(`  FAIL  ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`\nSMOKE: ${CHECKS.length - failed}/${CHECKS.length} passed`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  }
}

main();
