"use client";

import type { WidgetProps } from "@/agent/widget-schemas";

// Mirrors the OmniPro 220 front panel's lower connector strip (owner-manual
// p.8): spool-gun gas outlet, negative socket, wire-feed power cable, positive
// socket. Cables are drawn to their target socket per the validated props —
// the geometry is fixed, the routing is data.
const SOCKETS: Record<string, { x: number; label: string; sub: string }> = {
  "wire-feed": { x: 195, label: "⚡", sub: "WIRE FEED" },
  negative: { x: 130, label: "−", sub: "NEG" },
  positive: { x: 260, label: "+", sub: "POS" },
};

const CABLE_COLORS = ["#f59e0b", "#38bdf8", "#a3e635"];

export default function PolarityDiagram({
  process,
  connections,
  note,
  citation,
}: WidgetProps<"polarity_diagram">) {
  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{process} — Cable Hookup</h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {citation.doc} p.{citation.page}
        </span>
      </div>

      <svg viewBox="0 0 340 200" className="w-full">
        {/* panel */}
        <rect x="20" y="18" width="300" height="76" rx="8" fill="#18181b" stroke="#3f3f46" />
        <text x="34" y="38" fill="#71717a" fontSize="9" fontFamily="monospace">
          VULCAN OMNIPRO 220 — FRONT PANEL
        </text>
        {Object.entries(SOCKETS).map(([key, s]) => {
          const used = connections.some((c) => c.socket === key);
          return (
            <g key={key}>
              <circle
                cx={s.x}
                cy={64}
                r={15}
                fill="#09090b"
                stroke={used ? "#f59e0b" : "#3f3f46"}
                strokeWidth={used ? 2.5 : 1}
              />
              <text x={s.x} y={69} textAnchor="middle" fill={used ? "#fbbf24" : "#52525b"} fontSize="14" fontWeight="bold">
                {s.label}
              </text>
              <text x={s.x} y={90} textAnchor="middle" fill="#71717a" fontSize="7" fontFamily="monospace">
                {s.sub}
              </text>
            </g>
          );
        })}
        {/* cables — labels start at x=8 (anchor start) so long names never clip */}
        {connections.map((c, i) => {
          const s = SOCKETS[c.socket];
          const y0 = 150 + i * 22;
          const color = CABLE_COLORS[i % CABLE_COLORS.length];
          return (
            <g key={i}>
              <path
                d={`M 105 ${y0} C 170 ${y0}, ${s.x} ${y0 - 20}, ${s.x} 84`}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={s.x} cy={82} r={3.5} fill={color} />
              <text x="8" y={y0 + 4} textAnchor="start" fill={color} fontSize="10" fontFamily="monospace">
                {c.cable}
              </text>
            </g>
          );
        })}
      </svg>

      {note && <p className="mt-1 text-[12px] text-amber-200/80">⚠ {note}</p>}
    </div>
  );
}
