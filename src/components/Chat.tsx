"use client";

import { useEffect, useRef, useState } from "react";
import {
  createRecognizer,
  drainSentences,
  speak,
  speechSupported,
  stopSpeaking,
} from "@/lib/speech";
import GraphView from "./GraphView";
import ManualBrowser from "./ManualBrowser";
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
  const [browserOpen, setBrowserOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const voiceOnRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Detected after mount: the server can't know the browser's speech support,
  // and branching on `window` during render causes hydration mismatches.
  const [support, setSupport] = useState({ stt: false, tts: false });
  useEffect(() => {
    setSupport(speechSupported());
  }, []);

  const startListening = () => {
    if (!support.stt || listening || busy) return;
    stopSpeaking(); // barge-in: talking interrupts the answer
    setListening(true);
    const rec = createRecognizer(
      (text) => send(text),
      () => setListening(false),
    );
    rec.start();
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    if (!next) stopSpeaking();
  };

  // Persist the conversation across refreshes (evaluators refresh mid-session).
  // Versioned key + field normalization: stale/partial saved shapes must never
  // crash the app — worst case is an empty chat, never a white screen.
  const STORE_KEY = "omnipro-chat-v2";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;
      setMessages(
        parsed
          .filter((m) => m && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : "",
            media: Array.isArray(m.media) ? m.media : [],
            widgets: Array.isArray(m.widgets) ? m.widgets : [],
            artifacts: Array.isArray(m.artifacts) ? m.artifacts : [],
            toolActivity: Array.isArray(m.toolActivity) ? m.toolActivity : [],
          })),
      );
    } catch {
      localStorage.removeItem(STORE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!busy) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
      } catch {
        /* storage full/blocked — persistence is best-effort */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  const clearChat = () => {
    setMessages([]);
    setActiveNodes([]);
    localStorage.removeItem(STORE_KEY);
  };

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");

    const userMsg: ChatMsg = { role: "user", content: text, media: [], widgets: [], artifacts: [], toolActivity: [] };
    const history = [...messages, userMsg];
    const assistant: ChatMsg = { role: "assistant", content: "", media: [], widgets: [], artifacts: [], toolActivity: [] };
    setMessages([...history, assistant]);

    const update = () => setMessages([...history, { ...assistant }]);
    const touched: string[] = [];
    setActiveNodes([]);
    let speechBuffer = "";
    const speakDelta = (delta: string) => {
      if (!voiceOnRef.current) return;
      speechBuffer += delta;
      const [sentences, rest] = drainSentences(speechBuffer);
      speechBuffer = rest;
      sentences.forEach(speak);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-access-code": localStorage.getItem("omnipro-access") ?? "",
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (res.status === 401) {
        setNeedsCode(true);
        setMessages([...messages]); // drop the pending exchange; re-sent after unlock
        setInput(text);
        return;
      }
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Rate limit reached on the hosted demo — run it locally with your own key (2-minute setup, see README).");
      }
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
              speakDelta(event.delta);
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
            case "artifact":
              assistant.artifacts.push({ title: event.title, html: event.html });
              break;
            case "graph_activity":
              touched.push(...event.nodeIds);
              setActiveNodes([...new Set(touched)]);
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
      if (voiceOnRef.current && speechBuffer.trim()) speak(speechBuffer);
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh">
    <div className="flex min-w-0 flex-1 flex-col px-6 lg:px-10">
      <header className="flex items-center gap-3 border-b border-zinc-800 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/product.webp" alt="Vulcan OmniPro 220" className="h-10 w-10 rounded object-cover" />
        <div className="flex-1">
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100">
            OmniPro <span className="text-amber-500">Expert</span>
          </h1>
          <p className="font-mono text-[11px] text-zinc-500">
            Vulcan OmniPro 220 · knowledge-graph-grounded · every answer cited
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="clear conversation"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
          >
            ⌫ clear
          </button>
        )}
        <button
          onClick={() => setBrowserOpen(true)}
          className="rounded-lg border border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition hover:border-zinc-600"
        >
          ⧉ manuals
        </button>
        <button
          onClick={() => setGraphOpen(!graphOpen)}
          className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] transition ${graphOpen ? "border-amber-600 bg-amber-950/40 text-amber-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
        >
          ◉ knowledge graph
        </button>
      </header>

      <div className="flex-1 overflow-y-auto py-6 pr-2">
      <div className="mx-auto max-w-4xl space-y-6">
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
        {busy && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:300ms]" />
            </span>
            {messages[messages.length - 1]?.content === ""
              ? "consulting the knowledge graph…"
              : "still working…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      </div>

      <form
        className="mx-auto flex w-full max-w-4xl gap-2 border-t border-zinc-800 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            stopSpeaking(); // typing interrupts the answer
          }}
          placeholder={listening ? "listening…" : "e.g. what wire size for 1/4 inch steel?"}
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[15px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700"
        />
        {support.stt && (
          <button
            type="button"
            onClick={startListening}
            title="ask by voice"
            className={`rounded-lg border px-3 text-lg transition ${listening ? "animate-pulse border-red-700 bg-red-950/50" : "border-zinc-800 hover:border-zinc-600"}`}
          >
            🎙
          </button>
        )}
        {support.tts && (
          <button
            type="button"
            onClick={toggleVoice}
            title="speak answers aloud"
            className={`rounded-lg border px-3 text-lg transition ${voiceOn ? "border-amber-600 bg-amber-950/40" : "border-zinc-800 opacity-50 hover:border-zinc-600 hover:opacity-100"}`}
          >
            🔊
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {needsCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          <form
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              localStorage.setItem("omnipro-access", codeInput.trim());
              setNeedsCode(false);
            }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Access code</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
              This hosted demo runs on the author&apos;s API key, so it&apos;s gated. The code is
              included with the challenge submission. No code? Clone the repo and run it locally
              with your own key — the setup takes under 2 minutes.
            </p>
            <input
              autoFocus
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="access code"
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-amber-700"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-500"
            >
              Unlock
            </button>
          </form>
        </div>
      )}
      {browserOpen && (
        <ManualBrowser
          onOpenPage={(p) => {
            setBrowserOpen(false);
            setModal(p);
          }}
          onClose={() => setBrowserOpen(false)}
        />
      )}
      {modal && <PageModal pageRef={modal} onClose={() => setModal(null)} onNavigate={setModal} />}
    </div>

    {graphOpen && (
      <aside className="hidden w-[460px] shrink-0 border-l border-zinc-800 lg:block">
        <GraphView
          activeNodeIds={activeNodes}
          onOpenPage={setModal}
          onClose={() => setGraphOpen(false)}
        />
      </aside>
    )}
    </div>
  );
}
