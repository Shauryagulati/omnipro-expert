// Mirrors pipeline/omnipro_pipeline/schema.py — the graph's contract.

export type NodeType =
  | "product"
  | "process"
  | "component"
  | "setting"
  | "spec"
  | "procedure"
  | "failure_mode"
  | "safety_warning"
  | "part"
  | "figure"
  | "page"
  | "video_moment";

export type EdgeType =
  | "requires"
  | "causes"
  | "resolved_by"
  | "part_of"
  | "applies_to"
  | "differs_by"
  | "depicted_in"
  | "documented_on"
  | "demonstrated_in"
  | "incompatible_with";

export interface Source {
  doc: string;
  page?: number | null;
  figure_id?: string | null;
  bbox?: number[] | null;
  timestamp?: number | null;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  summary: string;
  aliases: string[];
  data: Record<string, unknown>;
  sources: Source[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  note?: string | null;
}

export interface Graph {
  product: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ScoredNode {
  node: GraphNode;
  score: number;
}
