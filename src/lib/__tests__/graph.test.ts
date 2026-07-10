import { describe, expect, test } from "vitest";
import { getNode, loadGraph, neighbors, searchGraph } from "../graph";

describe("graph library against the real committed graph", () => {
  test("loads with expected scale", () => {
    const g = loadGraph();
    expect(g.nodes.length).toBeGreaterThan(400);
    expect(g.edges.length).toBeGreaterThan(1000);
  });

  test("every node is grounded", () => {
    const g = loadGraph();
    for (const n of g.nodes) expect(n.sources.length).toBeGreaterThan(0);
  });

  test("duty cycle 240V search finds the spec with 25% @ 200A", () => {
    const hits = searchGraph("duty cycle MIG 240V");
    const top = hits.slice(0, 3).map((h) => h.node);
    const spec = top.find((n) => n.type === "spec" && JSON.stringify(n.data).includes("25"));
    expect(spec, JSON.stringify(top.map((n) => n.id))).toBeTruthy();
  });

  test("layman alias search works (stinger -> electrode holder)", () => {
    const hits = searchGraph("stinger");
    expect(
      hits.slice(0, 5).some((h) => /electrode|holder|stick/.test(h.node.id)),
      JSON.stringify(hits.slice(0, 5).map((h) => h.node.id)),
    ).toBe(true);
  });

  test("porosity has resolved_by neighborhood", () => {
    const hits = searchGraph("porosity");
    const porosity = hits.find((h) => h.node.type === "failure_mode")?.node;
    expect(porosity).toBeTruthy();
    const nb = neighbors(porosity!.id, ["resolved_by"]);
    expect(nb.nodes.length).toBeGreaterThan(0);
  });

  test("getNode returns null for unknown", () => {
    expect(getNode("spec:does-not-exist")).toBeNull();
  });
});
