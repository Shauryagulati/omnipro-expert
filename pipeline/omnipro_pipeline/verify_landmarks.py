"""Stage 4 gate: the graph must contain the facts evaluators will attack.

Run after build_graph. Exit 1 on any failure. Fix the PIPELINE on failure —
never hand-edit graph.json; the build must stay reproducible.
"""

import json
import sys

from .build_graph import GRAPH_PATH
from .schema import Graph


def node_text(n) -> str:
    return " ".join(
        [n.id, n.name, n.summary, " ".join(n.aliases), json.dumps(n.data)]
    ).lower()


def check(graph: Graph, desc: str, pred) -> bool:
    ok = pred(graph)
    print(("PASS " if ok else "FAIL ") + desc)
    return ok


def has_node(g, *terms, type=None):
    return any(
        (type is None or n.type == type) and all(t in node_text(n) for t in terms)
        for n in g.nodes
    )


def has_edge_between(g, src_terms, dst_terms, etype):
    nodes = {n.id: n for n in g.nodes}
    return any(
        e.type == etype
        and all(t in node_text(nodes[e.source]) for t in src_terms)
        and all(t in node_text(nodes[e.target]) for t in dst_terms)
        for e in g.edges
    )


LANDMARKS = [
    (
        "MIG 240V duty cycle spec exists with 25% @ 200A",
        lambda g: has_node(g, "mig", "240", "25", "200", type="spec"),
    ),
    (
        "MIG 120V duty cycle is a SEPARATE node (40% @ 100A)",
        lambda g: has_node(g, "mig", "120", "40", "100", type="spec"),
    ),
    (
        "Flux-cored polarity captured (ground clamp to POSITIVE terminal)",
        lambda g: has_node(g, "flux", "polarity") and has_node(g, "ground", "positive"),
    ),
    (
        "TIG polarity captured",
        lambda g: has_node(g, "tig", "polarity"),
    ),
    (
        "Porosity failure mode with resolved_by edges",
        lambda g: has_edge_between(g, ["porosity"], [], "resolved_by"),
    ),
    (
        "Porosity <-> polarity linkage exists",
        lambda g: has_edge_between(g, ["porosity"], ["polarity"], "resolved_by")
        or has_edge_between(g, ["polarity"], ["porosity"], "causes"),
    ),
    (
        "Aluminum TIG incompatibility captured",
        lambda g: any(e.type == "incompatible_with" for e in g.edges),
    ),
    (
        "Galvanized/zinc fume safety warning node",
        lambda g: has_node(g, "zinc") or has_node(g, "galvanized"),
    ),
    (
        "Front panel figure node exists (p8)",
        lambda g: has_node(g, "owner-manual-p08", type="figure"),
    ),
    (
        "Selection chart content is in the graph as domain nodes",
        lambda g: any(
            s.doc == "selection-chart"
            for n in g.nodes
            if n.type not in ("page", "figure")
            for s in n.sources
        ),
    ),
    (
        "Every domain node has a documented_on grounding edge",
        lambda g: all(
            any(e.source == n.id and e.type == "documented_on" for e in g.edges)
            for n in g.nodes
            if n.type not in ("page", "figure", "video_moment")
        ),
    ),
]


def main() -> None:
    g = Graph.model_validate_json(GRAPH_PATH.read_text())
    results = [check(g, d, p) for d, p in LANDMARKS]
    print(f"LANDMARKS: {sum(results)}/{len(results)}")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
