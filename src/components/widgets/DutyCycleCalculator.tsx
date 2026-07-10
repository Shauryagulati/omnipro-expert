"use client";

import { useState } from "react";
import { dutyAt, isDocumented, weldRestMinutes } from "@/lib/duty-cycle";
import type { WidgetProps } from "@/agent/widget-schemas";

export default function DutyCycleCalculator({
  process,
  voltage,
  points,
  citation,
}: WidgetProps<"duty_cycle_calculator">) {
  const amps = points.map((p) => p.amps);
  const [current, setCurrent] = useState(amps[amps.length - 1]);
  const duty = dutyAt(points, current);
  const { weld, rest } = weldRestMinutes(duty);
  const documented = isDocumented(points, current);

  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">
          Duty Cycle — {process} @ {voltage}
        </h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {citation.doc} p.{citation.page}
        </span>
      </div>

      <div className="mb-2 flex items-end justify-between">
        <span className="font-mono text-3xl font-bold text-amber-400">{current}A</span>
        <span className="font-mono text-3xl font-bold text-zinc-100">{duty}%</span>
      </div>

      <input
        type="range"
        min={Math.min(...amps)}
        max={Math.max(...amps)}
        value={current}
        onChange={(e) => setCurrent(Number(e.target.value))}
        className="w-full accent-amber-500"
      />

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-zinc-800/70 py-2">
          <div className="font-mono text-lg text-amber-300">{weld} min</div>
          <div className="text-[11px] text-zinc-500">welding</div>
        </div>
        <div className="rounded bg-zinc-800/70 py-2">
          <div className="font-mono text-lg text-zinc-300">{rest} min</div>
          <div className="text-[11px] text-zinc-500">resting (per 10 min)</div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        {documented
          ? "Documented rating from the specifications table."
          : `Interpolated between documented points (${points
              .map((p) => `${p.dutyPct}% @ ${p.amps}A`)
              .join(", ")}).`}
      </p>
    </div>
  );
}
