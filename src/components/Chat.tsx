"use client";

import { useEffect, useRef, useState } from "react";
import Message, { type ChatMsg } from "./Message";
import PageModal, { type PageRef } from "./PageModal";

const STARTERS = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG? Which socket does the ground clamp go in?",
  "Can I weld aluminum with this machine?",
];

const TOOL_LABELS: Record<string, string> = {
  mcp__omnipro__search_graph: "searching knowledge graph",
  mcp__omnipro__traverse: "traversing graph edges",
  mcp__omnipro__get_figure: "pulling manual diagram",
  mcp__omnipro__get_page: "opening manual page",
  mcp__omnipro__graph_stats: "checking graph stats",
};

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<PageRef | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");

    const userMsg: ChatMsg = { role: "user", content: text, media: [], widgets: [], toolActivity: [] };
    const history = [...messages, userMsg];
    const assistant: ChatMsg = { role: "assistant", content: "", media: [], widgets: [], toolActivity: [] };
    setMessages([...history, assistant]);

    const update = () => setMessages([...history, { ...assistant }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          switch (event.type) {
            case "text":
              assistant.content += event.delta;
              break;
            case "tool_call": {
              const label = TOOL_LABELS[event.name];
              if (label && !assistant.toolActivity.includes(label))
                assistant.toolActivity.push(label);
              break;
            }
            case "figure":
              assistant.media.push({
                kind: "figure",
                url: event.url,
                caption: event.caption,
                doc: event.doc,
                page: event.page,
              });
              break;
            case "page":
              assistant.media.push({
                kind: "page",
                url: event.url,
                caption: `Manual page ${event.page}`,
                doc: event.doc,
                page: event.page,
              });
              break;
            case "widget":
              assistant.widgets.push({ widget: event.widget, props: event.props });
              break;
            case "error":
              assistant.content += `\n\n> ⚠️ ${event.message}`;
              break;
          }
          update();
        }
      }
    } catch (err) {
      assistant.content += `\n\n> ⚠️ ${err instanceof Error ? err.message : String(err)}`;
      update();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center gap-3 border-b border-zinc-800 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/product.webp" alt="Vulcan OmniPro 220" className="h-10 w-10 rounded object-cover" />
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100">
            OmniPro <span className="text-amber-500">Expert</span>
          </h1>
          <p className="font-mono text-[11px] text-zinc-500">
            Vulcan OmniPro 220 · knowledge-graph-grounded · every answer cited
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <p className="max-w-md text-center text-sm text-zinc-400">
              Ask anything about setting up, running, or troubleshooting your OmniPro 220.
              Answers come from the actual manuals — cited to the page.
            </p>
            <div className="grid gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left text-sm text-zinc-300 transition hover:border-amber-700 hover:text-amber-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} msg={m} onOpenPage={setModal} />
        ))}
        {busy && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            consulting the knowledge graph…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t border-zinc-800 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. what wire size for 1/4 inch steel?"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[15px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {modal && <PageModal pageRef={modal} onClose={() => setModal(null)} onNavigate={setModal} />}
    </div>
  );
}
