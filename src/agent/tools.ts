import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { figureUrl, getNode, loadGraph, neighbors, pageUrl, searchGraph } from "@/lib/graph";
import type { EdgeType, GraphNode } from "@/lib/types";

// UI events pushed from inside tool handlers (figures, pages) so the client
// can render real payloads without parsing model text.
export type UiEvent =
  | { type: "figure"; figureId: string; caption: string; url: string; doc: string; page: number }
  | { type: "page"; doc: string; page: number; url: string; summary: string }
  | { type: "graph_activity"; nodeIds: string[] };

export type UiEmit = (event: UiEvent) => void;

const EDGE_TYPES = [
  "requires",
  "causes",
  "resolved_by",
  "part_of",
  "applies_to",
  "differs_by",
  "depicted_in",
  "documented_on",
  "demonstrated_in",
  "incompatible_with",
] as const;

function compact(n: GraphNode) {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    summary: n.summary,
    data: n.data,
    sources: n.sources.map((s) => ({ doc: s.doc, page: s.page, figure_id: s.figure_id })),
  };
}

const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

export function buildToolServer(emit: UiEmit) {
  return createSdkMcpServer({
    name: "omnipro",
    version: "1.0.0",
    tools: [
      tool(
        "search_graph",
        "Find knowledge-graph nodes matching a query. Understands layman synonyms. Returns nodes with their data and source pages.",
        { query: z.string().describe("search terms, e.g. 'duty cycle MIG 240V' or 'stinger'") },
        async ({ query }) => {
          const hits = searchGraph(query, 8);
          emit({ type: "graph_activity", nodeIds: hits.map((h) => h.node.id) });
          return text({ results: hits.map((h) => compact(h.node)) });
        },
      ),
      tool(
        "traverse",
        "Follow typed edges from a node. Use for multi-hop reasoning: causes/resolved_by (troubleshooting), differs_by (process/voltage variants), incompatible_with (can't-do), depicted_in (figures), requires (prerequisites).",
        {
          node_id: z.string().describe("starting node id, e.g. 'failure_mode:porosity-wire'"),
          edge_types: z.array(z.enum(EDGE_TYPES)).optional().describe("filter to these edge types"),
          depth: z.number().int().min(1).max(3).optional().describe("hops, default 1"),
        },
        async ({ node_id, edge_types, depth }) => {
          const start = getNode(node_id);
          if (!start) return text({ error: `no node '${node_id}' — use search_graph first` });
          const nb = neighbors(node_id, edge_types as EdgeType[] | undefined, depth ?? 1);
          emit({ type: "graph_activity", nodeIds: [node_id, ...nb.nodes.map((n) => n.id)] });
          return text({
            start: compact(start),
            neighbors: nb.nodes.map(compact),
            edges: nb.edges,
          });
        },
      ),
      tool(
        "get_figure",
        "Display an actual diagram/figure from the manual to the user. Use whenever the answer involves a physical thing they need to see.",
        { figure_id: z.string().describe("e.g. 'owner-manual-p08-f1'") },
        async ({ figure_id }) => {
          const node = getNode(`figure:${figure_id}`);
          if (!node) return text({ error: `no figure '${figure_id}'` });
          const src = node.sources[0];
          emit({
            type: "figure",
            figureId: figure_id,
            caption: node.name,
            url: figureUrl(figure_id),
            doc: src.doc,
            page: src.page ?? 0,
          });
          return text({ shown_to_user: true, figure_id, caption: node.name, description: node.summary });
        },
      ),
      tool(
        "get_page",
        "Display a full manual page to the user and get its summary/key facts back.",
        {
          doc: z.enum(["owner-manual", "quick-start-guide", "selection-chart"]),
          page: z.number().int().min(1).max(48),
        },
        async ({ doc, page }) => {
          const node = getNode(`page:${doc}-${String(page).padStart(2, "0")}`);
          if (!node) return text({ error: `no page ${doc} p.${page}` });
          emit({ type: "page", doc, page, url: pageUrl(doc, page), summary: node.summary });
          return text({ shown_to_user: true, doc, page, summary: node.summary, topics: node.data.topics });
        },
      ),
      tool(
        "graph_stats",
        "Basic stats about the knowledge graph (for meta questions about how you work).",
        {},
        async () => {
          const g = loadGraph();
          return text({ nodes: g.nodes.length, edges: g.edges.length, product: g.product });
        },
      ),
    ],
  });
}

export const ALLOWED_TOOLS = [
  "mcp__omnipro__search_graph",
  "mcp__omnipro__traverse",
  "mcp__omnipro__get_figure",
  "mcp__omnipro__get_page",
  "mcp__omnipro__graph_stats",
];
