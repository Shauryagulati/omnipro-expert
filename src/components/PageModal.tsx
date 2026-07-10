"use client";

import { useEffect } from "react";

export interface PageRef {
  doc: string;
  page: number;
}

const PAGE_COUNTS: Record<string, number> = {
  "owner-manual": 48,
  "quick-start-guide": 2,
  "selection-chart": 1,
};

export function pageImageUrl(doc: string, page: number): string {
  return `/products/vulcan-omnipro-220/pages/${doc}-${String(page).padStart(2, "0")}.png`;
}

export default function PageModal({
  pageRef,
  onClose,
  onNavigate,
}: {
  pageRef: PageRef;
  onClose: () => void;
  onNavigate: (p: PageRef) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && pageRef.page < (PAGE_COUNTS[pageRef.doc] ?? 1))
        onNavigate({ ...pageRef, page: pageRef.page + 1 });
      if (e.key === "ArrowLeft" && pageRef.page > 1)
        onNavigate({ ...pageRef, page: pageRef.page - 1 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageRef, onClose, onNavigate]);

  const max = PAGE_COUNTS[pageRef.doc] ?? 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-6 border-b border-zinc-800 px-4 py-2">
          <span className="font-mono text-sm text-amber-400">
            {pageRef.doc} — p.{pageRef.page}
          </span>
          <div className="flex items-center gap-2 text-sm">
            <button
              className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
              disabled={pageRef.page <= 1}
              onClick={() => onNavigate({ ...pageRef, page: pageRef.page - 1 })}
            >
              ← prev
            </button>
            <button
              className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
              disabled={pageRef.page >= max}
              onClick={() => onNavigate({ ...pageRef, page: pageRef.page + 1 })}
            >
              next →
            </button>
            <button
              className="ml-2 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pageImageUrl(pageRef.doc, pageRef.page)}
          alt={`${pageRef.doc} page ${pageRef.page}`}
          className="min-h-0 flex-1 overflow-auto bg-white object-contain"
        />
      </div>
    </div>
  );
}
