import { loadGraph } from "@/lib/graph";

export const runtime = "nodejs";

// Trimmed graph for the visualization: enough to render and inspect,
// small enough to ship to the browser in one payload.
export async function GET() {
  const g = loadGraph();
  return Response.json(
    {
      nodes: g.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        summary: n.summary.slice(0, 240),
        data: n.data,
        sources: n.sources.map((s) => ({ doc: s.doc, page: s.page })),
      })),
      edges: g.edges.map((e) => ({ source: e.source, target: e.target, type: e.type })),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
