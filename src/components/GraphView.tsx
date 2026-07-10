"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useRef, useState } from "react";
import type { PageRef } from "./PageModal";

interface VizNode extends SimulationNodeDatum {
  id: string;
  type: string;
  name: string;
  summary: string;
  data: Record<string, unknown>;
  sources: { doc: string; page: number | null }[];
}

interface VizEdge extends SimulationLinkDatum<VizNode> {
  type: string;
}

const TYPE_COLORS: Record<string, string> = {
  product: "#fafafa",
  process: "#e4e4e7",
  spec: "#f59e0b",
  setting: "#a78bfa",
  component: "#4ade80",
  procedure: "#38bdf8",
  failure_mode: "#f87171",
  safety_warning: "#fb923c",
  part: "#a1a1aa",
  figure: "#52525b",
  page: "#3f3f46",
  video_moment: "#f472b6",
};

const DEFAULT_TYPES = new Set([
  "product",
  "process",
  "spec",
  "setting",
  "component",
  "procedure",
  "failure_mode",
  "safety_warning",
  "video_moment",
]);

export default function GraphView({
  activeNodeIds,
  onOpenPage,
  onClose,
}: {
  activeNodeIds: string[];
  onOpenPage: (p: PageRef) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [all, setAll] = useState<{ nodes: VizNode[]; edges: VizEdge[] } | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(DEFAULT_TYPES));
  const [selected, setSelected] = useState<VizNode | null>(null);
  const simRef = useRef<Simulation<VizNode, VizEdge> | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const nodesRef = useRef<VizNode[]>([]);
  const activeRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeRef.current = new Set(activeNodeIds);
  }, [activeNodeIds]);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then(setAll)
      .catch(() => setAll({ nodes: [], edges: [] }));
  }, []);

  // (Re)build the simulation whenever data or filters change.
  useEffect(() => {
    if (!all || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const nodes = all.nodes.filter((n) => enabled.has(n.type)).map((n) => ({ ...n }));
    const idset = new Set(nodes.map((n) => n.id));
    const edges: VizEdge[] = all.edges
      .filter((e) => idset.has(e.source as string) && idset.has(e.target as string))
      .map((e) => ({ ...e }));
    nodesRef.current = nodes;

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const sim = forceSimulation<VizNode>(nodes)
      .force("link", forceLink<VizNode, VizEdge>(edges).id((d) => d.id).distance(38).strength(0.4))
      .force("charge", forceManyBody().strength(-42))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(9));
    simRef.current = sim;

    let raf = 0;
    const radius = (n: VizNode) =>
      n.type === "product" ? 12 : n.type === "process" ? 9 : 4.5;

    const draw = () => {
      const { x, y, k } = viewRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(x, y);
      ctx.scale(k, k);

      ctx.strokeStyle = "rgba(113,113,122,0.18)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const e of edges) {
        const s = e.source as VizNode;
        const t = e.target as VizNode;
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
      }
      ctx.stroke();

      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      for (const n of nodes) {
        const r = radius(n);
        const isActive = activeRef.current.has(n.id);
        if (isActive) {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 5 + pulse * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245,158,11,${0.15 + pulse * 0.15})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = TYPE_COLORS[n.type] ?? "#71717a";
        ctx.globalAlpha = isActive || selected?.id === n.id ? 1 : 0.82;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (selected?.id === n.id) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2 / k;
          ctx.stroke();
        }
        if (isActive || selected?.id === n.id || k > 2.2 || n.type === "process" || n.type === "product") {
          ctx.fillStyle = "#d4d4d8";
          ctx.font = `${10 / k}px ui-monospace, monospace`;
          ctx.fillText(n.name.slice(0, 28), n.x! + r + 3 / k, n.y! + 3 / k);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // pan / zoom / click
    let dragging = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    const onDown = (e: MouseEvent) => {
      dragging = true;
      moved = false;
      last = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      moved = true;
      viewRef.current.x += e.clientX - last.x;
      viewRef.current.y += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: MouseEvent) => {
      dragging = false;
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      const { x, y, k } = viewRef.current;
      const gx = (e.clientX - rect.left - x) / k;
      const gy = (e.clientY - rect.top - y) / k;
      let best: VizNode | null = null;
      let bestD = 12;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x! - gx, n.y! - gy);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      setSelected(best);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const v = viewRef.current;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      v.x = mx - (mx - v.x) * factor;
      v.y = my - (my - v.y) * factor;
      v.k *= factor;
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, enabled]);

  const toggleType = (t: string) => {
    const next = new Set(enabled);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setEnabled(next);
    setSelected(null);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Knowledge Graph</h2>
          <p className="font-mono text-[10px] text-zinc-500">
            {all ? `${all.nodes.length} nodes · ${all.edges.length} edges` : "loading…"} — nodes the
            agent just used glow amber
          </p>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-3 py-1.5">
        {Object.keys(TYPE_COLORS).map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${enabled.has(t) ? "border-zinc-600 text-zinc-300" : "border-zinc-800 text-zinc-600"}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
            {t}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full cursor-grab" />
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className="mr-2 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ background: `${TYPE_COLORS[selected.type]}22`, color: TYPE_COLORS[selected.type] }}
                >
                  {selected.type}
                </span>
                <span className="text-sm font-semibold text-zinc-100">{selected.name}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{selected.summary}</p>
            {Object.keys(selected.data).length > 0 && (
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-[10px] text-zinc-500">
                {JSON.stringify(selected.data, null, 1).slice(0, 400)}
              </pre>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {selected.sources
                .filter((s) => s.page)
                .map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onOpenPage({ doc: s.doc, page: s.page! })}
                    className="rounded border border-amber-800/50 bg-amber-950/40 px-1.5 font-mono text-[10px] text-amber-400 hover:bg-amber-900/40"
                  >
                    {s.doc} p.{s.page}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
