import { describe, expect, test } from "vitest";
import { widgetSchemas } from "@/agent/widget-schemas";
import { dutyAt, weldRestMinutes } from "../duty-cycle";

describe("duty cycle math (MIG 240V documented points)", () => {
  const points = [
    { amps: 115, dutyPct: 100 },
    { amps: 200, dutyPct: 25 },
  ];

  test("documented endpoints are exact", () => {
    expect(dutyAt(points, 200)).toBe(25);
    expect(dutyAt(points, 115)).toBe(100);
  });

  test("below lowest documented amps runs continuously", () => {
    expect(dutyAt(points, 80)).toBe(100);
  });

  test("interpolates between points", () => {
    const mid = dutyAt(points, 158); // ~halfway
    expect(mid).toBeGreaterThan(25);
    expect(mid).toBeLessThan(100);
  });

  test("weld/rest split adds to 10 minutes", () => {
    const { weld, rest } = weldRestMinutes(25);
    expect(weld).toBe(2.5);
    expect(weld + rest).toBe(10);
  });
});

describe("widget prop schemas", () => {
  test("valid duty cycle props pass", () => {
    const r = widgetSchemas.duty_cycle_calculator.safeParse({
      process: "MIG",
      voltage: "240V",
      points: [{ amps: 200, dutyPct: 25 }],
      citation: { doc: "owner-manual", page: 7 },
    });
    expect(r.success).toBe(true);
  });

  test("invented voltage value is rejected", () => {
    const r = widgetSchemas.duty_cycle_calculator.safeParse({
      process: "MIG",
      voltage: "480V",
      points: [{ amps: 200, dutyPct: 25 }],
      citation: { doc: "owner-manual", page: 7 },
    });
    expect(r.success).toBe(false);
  });

  test("polarity diagram requires a known socket", () => {
    const r = widgetSchemas.polarity_diagram.safeParse({
      process: "TIG",
      connections: [{ cable: "Ground Clamp", socket: "left-ish" }],
      citation: { doc: "quick-start-guide", page: 2 },
    });
    expect(r.success).toBe(false);
  });

  test("troubleshooting checks all need citations", () => {
    const r = widgetSchemas.troubleshooting_tree.safeParse({
      title: "Porosity",
      checks: [{ title: "Check polarity", detail: "..." }],
    });
    expect(r.success).toBe(false);
  });
});
