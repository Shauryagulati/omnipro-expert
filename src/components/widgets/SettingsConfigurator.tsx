"use client";

import { useMemo, useState } from "react";
import type { WidgetProps } from "@/agent/widget-schemas";

export default function SettingsConfigurator({
  title,
  rows,
  citation,
}: WidgetProps<"settings_configurator">) {
  const materials = useMemo(() => [...new Set(rows.map((r) => r.material))], [rows]);
  const [material, setMaterial] = useState(materials[0]);
  const thicknesses = useMemo(
    () => [...new Set(rows.filter((r) => r.material === material).map((r) => r.thickness))],
    [rows, material],
  );
  const [thickness, setThickness] = useState<string | null>(null);

  const matches = rows.filter(
    (r) => r.material === material && (thickness === null || r.thickness === thickness),
  );

  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {citation.doc} p.{citation.page}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {materials.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMaterial(m);
              setThickness(null);
            }}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] ${m === material ? "border-amber-600 bg-amber-950/50 text-amber-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {thicknesses.map((t) => (
          <button
            key={t}
            onClick={() => setThickness(thickness === t ? null : t)}
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${t === thickness ? "border-amber-600 bg-amber-950/50 text-amber-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {matches.map((r, i) => (
          <div key={i} className="rounded bg-zinc-950/70 px-3 py-2">
            <div className="flex justify-between font-mono text-[12px]">
              <span className="text-zinc-400">
                {r.process} · {r.thickness}
                {r.wire ? ` · ${r.wire}` : ""}
              </span>
            </div>
            <div className="text-[13px] font-semibold text-amber-300">{r.setting}</div>
          </div>
        ))}
        {matches.length === 0 && (
          <p className="text-[12px] text-zinc-500">No documented setting for that combination.</p>
        )}
      </div>
    </div>
  );
}
