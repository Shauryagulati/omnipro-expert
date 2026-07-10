/**
 * MCP connector: exposes the OmniPro 220 knowledge graph to any MCP client
 * (Claude Desktop, Cursor, etc.) over stdio — the same deployment surface
 * Prox uses to put product experts inside customers' existing AI tools.
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   "mcpServers": {
 *     "omnipro-expert": {
 *       "command": "npm",
 *       "args": ["run", "-s", "mcp"],
 *       "cwd": "/path/to/omnipro-expert"
 *     }
 *   }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { figureUrl, getNode, neighbors, pageUrl, searchGraph } from "../src/lib/graph";
import type { EdgeType } from "../src/lib/types";

const server = new McpServer({ name: "omnipro-expert", version: "1.0.0" });

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 1) }],
});

server.registerTool(
  "search_graph",
  {
    description:
      "Search the Vulcan OmniPro 220 welding-machine knowledge graph (specs, procedures, failure modes, safety warnings — every node cited to its manual page). Understands layman terms.",
    inputSchema: { query: z.string() },
  },
  async ({ query }) =>
    json({
      results: searchGraph(query, 8).map((h) => ({
        id: h.node.id,
        type: h.node.type,
        name: h.node.name,
        summary: h.node.summary,
        data: h.node.data,
        sources: h.node.sources.map((s) => ({ doc: s.doc, page: s.page })),
      })),
    }),
);

server.registerTool(
  "traverse",
  {
    description:
      "Follow typed edges from a graph node (causes, resolved_by, differs_by, incompatible_with, requires, depicted_in...). Use for troubleshooting chains and compatibility questions.",
    inputSchema: {
      node_id: z.string(),
      edge_types: z.array(z.string()).optional(),
      depth: z.number().int().min(1).max(3).optional(),
    },
  },
  async ({ node_id, edge_types, depth }) => {
    const start = getNode(node_id);
    if (!start) return json({ error: `no node '${node_id}'` });
    const nb = neighbors(node_id, edge_types as EdgeType[] | undefined, depth ?? 1);
    return json({
      start: { id: start.id, name: start.name, summary: start.summary, data: start.data },
      neighbors: nb.nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, summary: n.summary })),
      edges: nb.edges,
    });
  },
);

server.registerTool(
  "get_figure",
  {
    description: "Get a manual figure's description and image path by figure id.",
    inputSchema: { figure_id: z.string() },
  },
  async ({ figure_id }) => {
    const node = getNode(`figure:${figure_id}`);
    if (!node) return json({ error: `no figure '${figure_id}'` });
    return json({ figure_id, caption: node.name, description: node.summary, path: `public${figureUrl(figure_id)}` });
  },
);

server.registerTool(
  "get_page",
  {
    description: "Get a manual page's summary, topics, and image path.",
    inputSchema: {
      doc: z.enum(["owner-manual", "quick-start-guide", "selection-chart"]),
      page: z.number().int().min(1).max(48),
    },
  },
  async ({ doc, page }) => {
    const node = getNode(`page:${doc}-${String(page).padStart(2, "0")}`);
    if (!node) return json({ error: `no page ${doc} p.${page}` });
    return json({ doc, page, summary: node.summary, topics: node.data.topics, path: `public${pageUrl(doc, page)}` });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("omnipro-expert MCP server ready (stdio)");
}

main();
