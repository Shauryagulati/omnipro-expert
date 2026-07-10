"use client";

import ReactMarkdown from "react-markdown";
import type { WidgetType } from "@/agent/widget-schemas";
import type { PageRef } from "./PageModal";
import WidgetRenderer from "./widgets";

export interface MediaItem {
  kind: "figure" | "page";
  url: string;
  caption: string;
  doc: string;
  page: number;
}

export interface WidgetItem {
  widget: string;
  props: unknown;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  media: MediaItem[];
  widgets: WidgetItem[];
  toolActivity: string[];
}

const CITE_RE = /\[(owner-manual|quick-start-guide|selection-chart)\s+p\.?\s*(\d+)\]/g;

// Turn [doc p.N] citations into markdown links our renderer converts to chips.
function linkifyCitations(text: string): string {
  return text.replace(CITE_RE, (_m, doc, page) => `[${doc} p.${page}](#cite:${doc}:${page})`);
}

export default function Message({
  msg,
  onOpenPage,
}: {
  msg: ChatMsg;
  onOpenPage: (p: PageRef) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-600/90 px-4 py-2.5 text-[15px] text-zinc-950">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {msg.toolActivity.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {msg.toolActivity.map((t, i) => (
            <span
              key={i}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-500"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="prose prose-invert max-w-none text-[15px] leading-relaxed prose-p:my-2 prose-strong:text-amber-200 prose-li:my-0.5">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("#cite:")) {
                const [, doc, page] = href.split(":");
                return (
                  <button
                    onClick={() => onOpenPage({ doc, page: Number(page) })}
                    className="mx-0.5 inline-flex -translate-y-px items-center rounded border border-amber-700/50 bg-amber-950/40 px-1.5 py-0 align-middle font-mono text-[11px] font-medium text-amber-400 no-underline hover:bg-amber-900/50"
                    title={`Open ${doc} page ${page}`}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {linkifyCitations(msg.content)}
        </ReactMarkdown>
      </div>
      {msg.widgets.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {msg.widgets.map((w, i) => (
            <WidgetRenderer key={i} widget={w.widget as WidgetType} props={w.props} onOpenPage={onOpenPage} />
          ))}
        </div>
      )}
      {msg.media.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {msg.media.map((m, i) => (
            <figure
              key={i}
              className="max-w-sm cursor-pointer overflow-hidden rounded-lg border border-zinc-800 bg-white transition hover:border-amber-700"
              onClick={() => onOpenPage({ doc: m.doc, page: m.page })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.caption} className="max-h-72 w-full object-contain" />
              <figcaption className="border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
                {m.caption} · {m.doc} p.{m.page}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
