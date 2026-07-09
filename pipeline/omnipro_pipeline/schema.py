"""Typed schemas for the knowledge graph and per-page extraction output.

The grounding invariant lives here: a GraphNode without at least one Source
does not validate. Everything downstream (agent tools, graph view, evals)
can therefore assume every fact is traceable to a document location.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

NodeType = Literal[
    "product",
    "process",
    "component",
    "setting",
    "spec",
    "procedure",
    "failure_mode",
    "safety_warning",
    "part",
    "figure",
    "page",
    "video_moment",
]
EdgeType = Literal[
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
]
DocSlug = Literal["owner-manual", "quick-start-guide", "selection-chart", "video"]


class Source(BaseModel):
    doc: DocSlug
    page: int | None = None
    figure_id: str | None = None
    bbox: tuple[float, float, float, float] | None = None
    timestamp: float | None = None


class GraphNode(BaseModel):
    id: str
    type: NodeType
    name: str
    summary: str
    aliases: list[str] = []
    data: dict = {}
    sources: list[Source] = Field(min_length=1)


class GraphEdge(BaseModel):
    source: str
    target: str
    type: EdgeType
    note: str | None = None


class Graph(BaseModel):
    product: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]

    @model_validator(mode="after")
    def check_integrity(self):
        ids = [nd.id for nd in self.nodes]
        if len(ids) != len(set(ids)):
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            raise ValueError(f"duplicate node ids: {dupes}")
        idset = set(ids)
        for e in self.edges:
            if e.source not in idset or e.target not in idset:
                raise ValueError(f"edge references missing node: {e.source} -> {e.target}")
        return self


class TableData(BaseModel):
    title: str
    headers: list[str]
    rows: list[list[str]]


class FigureRef(BaseModel):
    figure_id: str
    page: int
    caption: str
    description: str
    bbox: tuple[float, float, float, float]


class PageExtraction(BaseModel):
    doc: DocSlug
    page: int
    summary: str
    text: str
    tables: list[TableData] = []
    figures: list[FigureRef] = []
    key_facts: list[str] = []
    topics: list[str] = []
