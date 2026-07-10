/**
 * Grounding eval: runs evals/questions.json through the real agent.
 *   npm run eval             — full suite (~30 questions, a few dollars-cents of API)
 *   npm run eval -- trap     — only one tier
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askAgent, startServer, stopServer, type AgentResult } from "./harness";

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;

interface Expect {
  regex?: string[];
  regex2?: string[];
  notRegex?: string[];
  citation?: boolean;
  visual?: boolean;
  widget?: string;
  asksBack?: boolean;
}

interface Question {
  id: string;
  tier: string;
  q: string;
  expect: Expect;
}

const CITE = /\[(owner-manual|quick-start-guide|selection-chart) p\.?\s*\d+\]/;

function judge(r: AgentResult, e: Expect): string[] {
  const errs: string[] = [];
  // All patterns case-insensitive; JS has no (?i) inline flag.
  for (const rx of [...(e.regex ?? []), ...(e.regex2 ?? [])]) {
    if (!new RegExp(rx, "i").test(r.text)) errs.push(`missing /${rx}/`);
  }
  for (const rx of e.notRegex ?? []) {
    if (new RegExp(rx, "i").test(r.text)) errs.push(`forbidden /${rx}/ present`);
  }
  if (e.citation && !CITE.test(r.text)) errs.push("no citation");
  if (e.visual && r.figures.length === 0 && r.widgets.length === 0 && r.pages === 0)
    errs.push("no visual shown");
  if (e.widget && !r.widgets.includes(e.widget)) errs.push(`widget ${e.widget} not shown`);
  if (e.asksBack) {
    if (!/\?/.test(r.text)) errs.push("did not ask back");
    if (CITE.test(r.text) && r.text.length > 800) errs.push("answered at length instead of clarifying");
  }
  return errs;
}

async function main() {
  const tierFilter = process.argv[2];
  const spec = JSON.parse(readFileSync(join(process.cwd(), "evals/questions.json"), "utf-8"));
  const questions: Question[] = spec.questions.filter(
    (q: Question) => !tierFilter || q.tier === tierFilter,
  );

  console.log(`running ${questions.length} evals${tierFilter ? ` (tier: ${tierFilter})` : ""}...`);
  const server = await startServer(PORT);
  const failures: { id: string; errs: string[]; text: string }[] = [];
  const byTier: Record<string, { pass: number; total: number }> = {};

  try {
    for (const q of questions) {
      byTier[q.tier] ??= { pass: 0, total: 0 };
      byTier[q.tier].total++;
      try {
        const r = await askAgent(BASE, q.q);
        await new Promise((res) => setTimeout(res, 4000)); // breathe between questions (rate limits)
        const errs = judge(r, q.expect);
        if (errs.length === 0) {
          byTier[q.tier].pass++;
          console.log(`  PASS ${q.id}`);
        } else {
          failures.push({ id: q.id, errs, text: r.text.slice(0, 300) });
          console.log(`  FAIL ${q.id}: ${errs.join(" | ")}`);
        }
      } catch (err) {
        failures.push({ id: q.id, errs: [String(err)], text: "" });
        console.log(`  FAIL ${q.id}: ${err}`);
        await new Promise((res) => setTimeout(res, 8000)); // back off after an error
      }
    }
  } finally {
    stopServer(server);
  }

  console.log("\n── tier summary ──");
  for (const [tier, s] of Object.entries(byTier)) {
    console.log(`  ${tier.padEnd(10)} ${s.pass}/${s.total}`);
  }
  const total = questions.length;
  const passed = total - failures.length;
  console.log(`\nEVAL: ${passed}/${total} (${Math.round((100 * passed) / total)}%)`);
  if (failures.length > 0) {
    console.log("\nfailed answers (truncated):");
    for (const f of failures) console.log(`\n[${f.id}]\n${f.text}`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main();
