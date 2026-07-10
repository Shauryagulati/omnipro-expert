"use client";

import { useState } from "react";

export default function ArtifactFrame({ title, html }: { title: string; html: string }) {
  const [expanded, setExpanded] = useState(false);

  const frame = (tall: boolean) => (
    <iframe
      sandbox="allow-scripts"
      srcDoc={html}
      title={title}
      className={`w-full rounded-b-lg bg-white ${tall ? "h-[80vh]" : "h-80"}`}
    />
  );

  return (
    <>
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
          <span className="font-mono text-[11px] text-zinc-400">⚙ {title}</span>
          <button
            onClick={() => setExpanded(true)}
            className="rounded px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            expand ⤢
          </button>
        </div>
        {frame(false)}
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
              <span className="font-mono text-sm text-amber-400">{title}</span>
              <button onClick={() => setExpanded(false)} className="text-zinc-400 hover:text-zinc-200">
                ✕
              </button>
            </div>
            {frame(true)}
          </div>
        </div>
      )}
    </>
  );
}
