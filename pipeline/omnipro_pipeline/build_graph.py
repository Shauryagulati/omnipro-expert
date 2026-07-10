"""Stage 3: assemble the knowledge graph.

Deterministic base (product/process/page/figure nodes) + LLM-proposed domain
nodes and edges per manual section, merged by canonical id, then an alias
enrichment pass. Edges referencing unknown nodes are dropped loudly, and every
domain node gets auto-grounding edges to its source pages/figures.
"""

import re
from pathlib import Path

from pydantic import BaseModel

from .extract import DATA_DIR
from .llm import extract_structured
from .schema import Graph, GraphEdge, GraphNode, PageExtraction, Source

GRAPH_PATH = DATA_DIR.parent / "graph.json"


class GraphProposal(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


def canonical_id(node_type: str, name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{node_type}:{slug}"


def load_pages() -> list[PageExtraction]:
    return [
        PageExtraction.model_validate_json(p.read_text()) for p in sorted(DATA_DIR.glob("*.json"))
    ]


def base_nodes() -> list[GraphNode]:
    nodes = [
        GraphNode(
            id="product:vulcan-omnipro-220",
            type="product",
            name="Vulcan OmniPro 220",
            summary="Multiprocess welding system (MIG, Flux-Cored, TIG, Stick), 120/240V input.",
            sources=[Source(doc="owner-manual", page=1)],
        )
    ]
    for p in ["mig", "flux-cored", "tig", "stick"]:
        nodes.append(
            GraphNode(
                id=f"process:{p}",
                type="process",
                name=p.upper().replace("-", " "),
                summary=f"{p} welding process supported by the OmniPro 220.",
                sources=[Source(doc="owner-manual", page=7)],
            )
        )
    for page in load_pages():
        nodes.append(
            GraphNode(
                id=f"page:{page.doc}-{page.page:02d}",
                type="page",
                name=f"{page.doc} p.{page.page}",
                summary=page.summary,
                data={"topics": page.topics},
                sources=[Source(doc=page.doc, page=page.page)],
            )
        )
        for fr in page.figures:
            nodes.append(
                GraphNode(
                    id=f"figure:{fr.figure_id}",
                    type="figure",
                    name=fr.caption or fr.figure_id,
                    summary=fr.description,
                    data={"png": f"figures/{fr.figure_id}.png"},
                    sources=[
                        Source(doc=page.doc, page=page.page, figure_id=fr.figure_id, bbox=fr.bbox)
                    ],
                )
            )
    return nodes


def merge(proposals: list[GraphProposal], base: list[GraphNode]) -> Graph:
    by_id: dict[str, GraphNode] = {n.id: n for n in base}
    for prop in proposals:
        for n in prop.nodes:
            raw_name = n.id.split(":", 1)[-1] if ":" in n.id else n.name
            n.id = canonical_id(n.type, raw_name)
            if n.id in by_id:
                ex = by_id[n.id]
                ex.aliases = sorted(set(ex.aliases) | set(n.aliases))
                ex.sources = ex.sources + [s for s in n.sources if s not in ex.sources]
                ex.data = {**n.data, **ex.data}
            else:
                by_id[n.id] = n

    def normalize_ref(ref: str) -> str:
        # Proposals sometimes hyphenate type prefixes ('safety-warning:x') or
        # vary slug punctuation; normalize to the same form as canonical_id.
        prefix, _, name = ref.partition(":")
        candidate = canonical_id(prefix.replace("-", "_"), name)
        return candidate if candidate in by_id else ref

    edges: list[GraphEdge] = []
    seen: set[tuple] = set()
    for prop in proposals:
        for e in prop.edges:
            e.source, e.target = normalize_ref(e.source), normalize_ref(e.target)
            key = (e.source, e.target, e.type)
            if e.source in by_id and e.target in by_id and key not in seen:
                seen.add(key)
                edges.append(e)
            elif e.source not in by_id or e.target not in by_id:
                print(f"  dropped edge {e.source} -[{e.type}]-> {e.target}")

    for n in by_id.values():  # auto-ground: node -> its pages/figures
        if n.type in ("page", "figure"):
            continue
        for s in n.sources:
            if s.page is not None:
                pid = f"page:{s.doc}-{s.page:02d}"
                if pid in by_id and (n.id, pid, "documented_on") not in seen:
                    seen.add((n.id, pid, "documented_on"))
                    edges.append(GraphEdge(source=n.id, target=pid, type="documented_on"))
            if s.figure_id and f"figure:{s.figure_id}" in by_id:
                key = (n.id, f"figure:{s.figure_id}", "depicted_in")
                if key not in seen:
                    seen.add(key)
                    edges.append(
                        GraphEdge(source=n.id, target=f"figure:{s.figure_id}", type="depicted_in")
                    )

    return Graph(product="vulcan-omnipro-220", nodes=list(by_id.values()), edges=edges)


SECTIONS = {
    "owner-manual": [
        ("safety", range(2, 7)),
        ("specs", [7]),
        ("controls", [8, 9]),
        ("wire-welding", range(10, 24)),
        ("tig-stick", range(24, 34)),
        ("welding-tips", range(34, 41)),
        ("maintenance", range(41, 46)),
        ("parts", [46, 47]),
    ],
    "quick-start-guide": [("quick-start", [1, 2])],
    "selection-chart": [("selection-chart", [1])],
}

PROPOSE_SYSTEM = """You build a knowledge graph for a welding-machine support agent from
extracted manual pages. Propose domain nodes (spec, setting, component, procedure, failure_mode,
safety_warning, part) and typed edges. Rules:
- Node ids: <type>:<kebab-name>. Names concrete: 'Duty Cycle MIG 240V', 'Positive Socket'.
- specs carrying voltage-dependent values MUST be separate nodes per input voltage,
  with data like {"points": [{"amps": 200, "duty_pct": 25}], "input_voltage": "240V"}.
- Every node needs sources with the page(s) it came from, and figure_id when the fact
  lives in a diagram. Every failure_mode gets resolved_by edges to procedures/settings.
- Use incompatible_with for things this machine cannot do (e.g. aluminum TIG needs AC; this
  machine is DC-only). Use differs_by for process/voltage variations (flux-cored polarity
  differs from MIG). Edges may reference process:mig, process:flux-cored, process:tig,
  process:stick, product:vulcan-omnipro-220 and any node you propose in THIS batch."""


CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "proposals"
CHUNK_PAGES = 5  # bigger batches overflow the output budget on dense sections


def propose_section(name: str, pages: list[PageExtraction]) -> GraphProposal:
    cache_file = CACHE_DIR / f"{name.replace('/', '_')}.json"
    if cache_file.exists():
        print(f"  (cached) {name}", flush=True)
        return GraphProposal.model_validate_json(cache_file.read_text())
    body = "\n\n".join(p.model_dump_json() for p in pages)
    prop = extract_structured(
        PROPOSE_SYSTEM,
        [{"type": "text", "text": f"Section: {name}\n\nPages:\n{body}"}],
        GraphProposal,
        max_tokens=16384,
    )
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(prop.model_dump_json())
    return prop


class AliasMap(BaseModel):
    aliases: dict[str, list[str]]


ALIAS_BATCH = 50  # whole-graph alias calls overflow the output budget


def enrich_aliases(graph: Graph) -> Graph:
    domain = [n for n in graph.nodes if n.type not in ("page", "figure")]
    merged: dict[str, list[str]] = {}
    for i in range(0, len(domain), ALIAS_BATCH):
        batch = domain[i : i + ALIAS_BATCH]
        listing = "\n".join(f"{n.id}: {n.name} — {n.summary[:80]}" for n in batch)
        result = extract_structured(
            "For each node id, list 2-5 layman synonyms a garage DIYer might say ('stinger' for "
            "electrode holder, 'wire speed knob', 'the plus plug'). "
            "Return {aliases: {node_id: [...]}} covering every listed id.",
            [{"type": "text", "text": listing}],
            AliasMap,
        )
        merged.update(result.aliases)
        print(f"  aliases {i + len(batch)}/{len(domain)}", flush=True)
    for n in graph.nodes:
        if n.id in merged:
            n.aliases = sorted(set(n.aliases) | set(merged[n.id]))
    return graph


def main() -> None:
    pages = {(p.doc, p.page): p for p in load_pages()}
    proposals = []
    for doc, sections in SECTIONS.items():
        for name, page_range in sections:
            batch = [pages[(doc, n)] for n in page_range if (doc, n) in pages]
            for i in range(0, len(batch), CHUNK_PAGES):
                chunk = batch[i : i + CHUNK_PAGES]
                label = f"{doc}/{name}" + (f"-{i // CHUNK_PAGES + 1}" if len(batch) > CHUNK_PAGES else "")
                prop = propose_section(label, chunk)
                print(f"{label}: {len(prop.nodes)} nodes, {len(prop.edges)} edges", flush=True)
                proposals.append(prop)
    graph = merge(proposals, base_nodes())
    graph = enrich_aliases(graph)
    GRAPH_PATH.write_text(graph.model_dump_json(indent=2))
    print(f"graph: {len(graph.nodes)} nodes, {len(graph.edges)} edges -> {GRAPH_PATH}")


if __name__ == "__main__":
    main()
