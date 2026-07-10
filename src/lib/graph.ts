// In-memory graph over the committed graph.json. Deterministic retrieval:
// token scoring over id/name/aliases/summary (aliases weighted highest — they
// carry the layman vocabulary generated at build time), then typed-edge
// traversal does the semantic work. Intentionally no vector index; see
// pipeline/README.md for the argument.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EdgeType, Graph, GraphEdge, GraphNode, ScoredNode } from "./types";

const PRODUCT = "vulcan-omnipro-220";

let cached: Graph | null = null;
let nodeIndex: Map<string, GraphNode> | null = null;
let adjacency: Map<string, GraphEdge[]> | null = null;

export function loadGraph(): Graph {
  if (cached) return cached;
  const path = join(process.cwd(), "data", "products", PRODUCT, "graph.json");
  cached = JSON.parse(readFileSync(path, "utf-8")) as Graph;
  nodeIndex = new Map(cached.nodes.map((n) => [n.id, n]));
  adjacency = new Map();
  for (const e of cached.edges) {
    for (const end of [e.source, e.target]) {
      if (!adjacency.has(end)) adjacency.set(end, []);
      adjacency.get(end)!.push(e);
    }
  }
  return cached;
}

export function getNode(id: string): GraphNode | null {
  loadGraph();
  return nodeIndex!.get(id) ?? null;
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%./"]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);

export function searchGraph(query: string, limit = 8): ScoredNode[] {
  const g = loadGraph();
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  // Exact token match, or prefix match when the prefix is substantial (≥4
  // chars). Loose substring matching lets "stinger" match the token "in".
  const matches = (a: string, t: string): boolean =>
    a === t ||
    (t.length >= 4 && a.startsWith(t)) ||
    (a.length >= 4 && t.startsWith(a));

  const scored: ScoredNode[] = [];
  for (const n of g.nodes) {
    if (n.type === "page") continue; // pages are grounding targets, not answers
    const aliasText = tokenize(n.aliases.join(" "));
    const nameText = tokenize(`${n.id.replace(/[:_-]/g, " ")} ${n.name}`);
    const bodyText = tokenize(`${n.summary} ${JSON.stringify(n.data)}`);
    let score = 0;
    for (const t of qTokens) {
      if (aliasText.some((a) => matches(a, t))) score += 3;
      if (nameText.some((w) => matches(w, t))) score += 2;
      if (bodyText.some((w) => w === t)) score += 1;
    }
    if (score > 0) scored.push({ node: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function neighbors(
  id: string,
  edgeTypes?: EdgeType[],
  depth = 1,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  loadGraph();
  const seenNodes = new Set<string>([id]);
  const outEdges: GraphEdge[] = [];
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const nid of frontier) {
      for (const e of adjacency!.get(nid) ?? []) {
        if (edgeTypes && !edgeTypes.includes(e.type)) continue;
        outEdges.push(e);
        const other = e.source === nid ? e.target : e.source;
        if (!seenNodes.has(other)) {
          seenNodes.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  seenNodes.delete(id);
  return {
    nodes: [...seenNodes].map((nid) => nodeIndex!.get(nid)!).filter(Boolean),
    edges: outEdges,
  };
}

export function figureUrl(figureId: string): string {
  return `/products/${PRODUCT}/figures/${figureId}.png`;
}

export function pageUrl(doc: string, page: number): string {
  return `/products/${PRODUCT}/pages/${doc}-${String(page).padStart(2, "0")}.png`;
}
