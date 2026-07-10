"use client";

import { useState } from "react";
import type { WidgetProps } from "@/agent/widget-schemas";

export default function TroubleshootingTree({
  title,
  checks,
  onOpenPage,
}: WidgetProps<"troubleshooting_tree"> & {
  onOpenPage?: (p: { doc: string; page: number }) => void;
}) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setDone(next);
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {done.size}/{checks.length} checked
        </span>
      </div>
      <ol className="space-y-1.5">
        {checks.map((c, i) => (
          <li key={i} className="rounded border border-zinc-800 bg-zinc-950/60">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={done.has(i)}
                onChange={() => toggle(i)}
                className="h-4 w-4 accent-amber-500"
              />
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className={`flex-1 text-left text-[13px] ${done.has(i) ? "text-zinc-600 line-through" : "text-zinc-200"}`}
              >
                {i + 1}. {c.title}
              </button>
              <span className="text-zinc-600">{open === i ? "▾" : "▸"}</span>
            </div>
            {open === i && (
              <div className="border-t border-zinc-800 px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
                {c.detail}
                <button
                  onClick={() => onOpenPage?.({ doc: c.citation.doc, page: c.citation.page })}
                  className="ml-2 rounded border border-amber-800/50 bg-amber-950/40 px-1.5 font-mono text-[10px] text-amber-400 hover:bg-amber-900/40"
                >
                  {c.citation.doc} p.{c.citation.page}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
