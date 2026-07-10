"use client";

import { useState } from "react";
import type { WidgetProps } from "@/agent/widget-schemas";

export default function ProcessSelector({
  options,
  citation,
}: WidgetProps<"process_selector">) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = options.find((o) => o.process === picked);

  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Which process fits your job?</h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {citation.doc} p.{citation.page}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {options.map((o) => (
          <button
            key={o.process}
            onClick={() => setPicked(o.process)}
            className={`rounded-lg border px-3 py-2 text-left ${picked === o.process ? "border-amber-600 bg-amber-950/40" : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-600"}`}
          >
            <div className="text-[13px] font-semibold text-zinc-100">{o.process}</div>
            <div className="text-[11px] text-zinc-500">skill: {o.skill}</div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded bg-zinc-950/70 px-3 py-2 text-[12px] leading-relaxed text-zinc-300">
          <div><span className="text-zinc-500">gas:</span> {selected.gas}</div>
          <div><span className="text-zinc-500">materials:</span> {selected.materials.join(", ")}</div>
          <div><span className="text-zinc-500">thickness:</span> {selected.thickness}</div>
          <div className="mt-1 text-amber-200/90">{selected.bestFor}</div>
        </div>
      )}
    </div>
  );
}
