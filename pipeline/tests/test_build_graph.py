from omnipro_pipeline.build_graph import GraphProposal, base_nodes, canonical_id, merge
from omnipro_pipeline.schema import GraphEdge, GraphNode, Source


def mknode(id, name, page=7, **kw):
    d = dict(
        id=id,
        type="spec",
        name=name,
        summary="s",
        sources=[Source(doc="owner-manual", page=page)],
    )
    d.update(kw)
    return GraphNode(**d)


def test_canonical_id_kebabs_and_prefixes():
    assert canonical_id("spec", "Duty Cycle (MIG, 240V)") == "spec:duty-cycle-mig-240v"


def test_merge_unions_duplicate_nodes():
    a = GraphProposal(
        nodes=[mknode("spec:duty-cycle-mig-240v", "Duty Cycle MIG 240V", page=7)], edges=[]
    )
    b = GraphProposal(
        nodes=[
            mknode(
                "spec:duty-cycle-mig-240v",
                "Duty Cycle MIG 240V",
                page=19,
                aliases=["mig duty cycle"],
            )
        ],
        edges=[],
    )
    g = merge([a, b], base=[])
    node = next(n for n in g.nodes if n.id == "spec:duty-cycle-mig-240v")
    assert {s.page for s in node.sources} == {7, 19}
    assert "mig duty cycle" in node.aliases


def test_merge_drops_edges_to_missing_nodes():
    a = GraphProposal(
        nodes=[mknode("spec:x", "x")],
        edges=[GraphEdge(source="spec:x", target="spec:ghost", type="applies_to")],
    )
    g = merge([a], base=[])
    assert all(e.type == "documented_on" for e in g.edges)  # only auto-grounding survives


def test_base_nodes_include_pages_and_processes():
    nodes = base_nodes()
    ids = {n.id for n in nodes}
    assert "process:mig" in ids and "product:vulcan-omnipro-220" in ids
    assert any(i.startswith("page:owner-manual-") for i in ids)
