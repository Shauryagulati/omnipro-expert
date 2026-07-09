import pytest
from pydantic import ValidationError

from omnipro_pipeline.schema import Graph, GraphEdge, GraphNode, Source


def n(id, **kw):
    d = dict(
        id=id,
        type="component",
        name=id,
        summary="s",
        sources=[Source(doc="owner-manual", page=8)],
    )
    d.update(kw)
    return GraphNode(**d)


def test_node_requires_at_least_one_source():
    with pytest.raises(ValidationError):
        GraphNode(id="component:x", type="component", name="x", summary="s", sources=[])


def test_unknown_node_type_rejected():
    with pytest.raises(ValidationError):
        n("weird:x", type="weird")


def test_edge_must_reference_existing_nodes():
    with pytest.raises(ValidationError):
        Graph(
            product="vulcan-omnipro-220",
            nodes=[n("component:a")],
            edges=[GraphEdge(source="component:a", target="component:missing", type="part_of")],
        )


def test_duplicate_node_ids_rejected():
    with pytest.raises(ValidationError):
        Graph(product="vulcan-omnipro-220", nodes=[n("component:a"), n("component:a")], edges=[])


def test_valid_graph_roundtrips():
    g = Graph(
        product="vulcan-omnipro-220",
        nodes=[n("component:a"), n("component:b")],
        edges=[GraphEdge(source="component:a", target="component:b", type="part_of")],
    )
    assert Graph.model_validate_json(g.model_dump_json()).nodes[0].id == "component:a"
