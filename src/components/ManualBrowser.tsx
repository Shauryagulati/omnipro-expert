"use client";

import { pageImageUrl, type PageRef } from "./PageModal";

const DOCS: { slug: string; label: string; pages: number }[] = [
  { slug: "owner-manual", label: "Owner's Manual", pages: 48 },
  { slug: "quick-start-guide", label: "Quick Start Guide", pages: 2 },
  { slug: "selection-chart", label: "Process Selection Chart", pages: 1 },
];

export default function ManualBrowser({
  onOpenPage,
  onClose,
}: {
  onOpenPage: (p: PageRef) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <span className="text-sm font-semibold text-zinc-200">
            The Documentation <span className="font-mono text-[11px] text-zinc-500">— all 51 pages, click any to zoom</span>
          </span>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {DOCS.map((d) => (
            <div key={d.slug} className="mb-5">
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-amber-500/80">
                {d.label}
              </h3>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {Array.from({ length: d.pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => onOpenPage({ doc: d.slug, page: p })}
                    className="group overflow-hidden rounded border border-zinc-800 bg-white transition hover:border-amber-600"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pageImageUrl(d.slug, p)}
                      alt={`${d.label} p.${p}`}
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover object-top"
                    />
                    <span className="block bg-zinc-900 py-0.5 text-center font-mono text-[10px] text-zinc-500 group-hover:text-amber-400">
                      p.{p}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
