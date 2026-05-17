"use client";

import type { WallDebugOverlay } from "@/lib/bedroomWallLayout";

type Props = {
  data: WallDebugOverlay;
};

const roleStroke: Record<string, string> = {
  headline: "rgba(200, 72, 88, 0.62)",
  support: "rgba(62, 102, 172, 0.55)",
  texture: "rgba(160, 110, 38, 0.55)",
};

const bandFill: Record<string, string> = {
  L: "rgba(59, 130, 246, 0.045)",
  C: "rgba(99, 102, 241, 0.04)",
  R: "rgba(14, 165, 233, 0.042)",
};

export function WallLayoutDebugOverlay({ data }: Props) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[93] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <title>Wall layout debug</title>
      {data.territory.map((b) => (
        <rect
          key={b.label}
          x={b.leftPct}
          y={0}
          width={b.widthPct}
          height={100}
          fill={bandFill[b.label]}
          stroke="rgba(40, 45, 55, 0.07)"
          strokeWidth={0.08}
        />
      ))}
      {data.territory.map((b) => (
        <text
          key={`${b.label}-lbl`}
          x={b.leftPct + b.widthPct / 2}
          y={4.2}
          textAnchor="middle"
          fill="rgba(35, 38, 45, 0.38)"
          fontSize={2.1}
          fontFamily="ui-monospace, monospace"
        >
          {b.label}
        </text>
      ))}
      {data.grid
        ? data.grid.verticalsPct.map((x) => (
            <line
              key={`v-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={100}
              stroke="rgba(50, 55, 65, 0.09)"
              strokeWidth={0.06}
              strokeDasharray="0.4 0.35"
            />
          ))
        : null}
      {data.grid
        ? data.grid.horizontalsPct.map((y) => (
            <line
              key={`h-${y}`}
              x1={0}
              y1={y}
              x2={100}
              y2={y}
              stroke="rgba(50, 55, 65, 0.09)"
              strokeWidth={0.06}
              strokeDasharray="0.4 0.35"
            />
          ))
        : null}
      {data.posters.map((p) => {
        const stroke = roleStroke[p.role] ?? "rgba(60,60,60,0.5)";
        const hs = p.hotspotRadiusPct;
        const sepR = Math.max(0.4, p.sepVsMdPct * 0.48);
        return (
          <g key={p.slug}>
            <ellipse
              cx={p.leftPct}
              cy={p.topPct}
              rx={Math.max(0.35, p.halfWidthPct)}
              ry={Math.max(0.45, p.halfHeightPct)}
              fill="none"
              stroke={stroke}
              strokeWidth={0.12}
              strokeOpacity={0.5}
            />
            <circle
              cx={p.leftPct}
              cy={p.topPct}
              r={hs}
              fill="none"
              stroke="rgba(55, 60, 72, 0.42)"
              strokeWidth={0.1}
              strokeDasharray="0.55 0.45"
            />
            <circle
              cx={p.leftPct}
              cy={p.topPct}
              r={sepR}
              fill="none"
              stroke="rgba(45, 110, 75, 0.38)"
              strokeWidth={0.08}
              strokeDasharray="0.35 0.35"
            />
            <circle
              cx={p.leftPct}
              cy={p.topPct}
              r={0.55}
              fill={stroke}
              fillOpacity={0.85}
            />
            <text
              x={p.leftPct + 1.1}
              y={p.topPct + 0.55}
              fill="rgba(28, 30, 34, 0.72)"
              fontSize={1.55}
              fontFamily="ui-monospace, monospace"
            >
              #{p.idx} {p.role}
            </text>
            <text
              x={p.leftPct + 1.1}
              y={p.topPct + 2.25}
              fill="rgba(28, 30, 34, 0.4)"
              fontSize={1.2}
              fontFamily="ui-monospace, monospace"
            >
              hs {hs.toFixed(1)} · sep~{p.sepVsMdPct.toFixed(1)}
            </text>
          </g>
        );
      })}
      <text
        x={100 - 1.5}
        y={97}
        textAnchor="end"
        fill="rgba(100, 105, 115, 0.55)"
        fontSize={1.35}
        fontFamily="ui-monospace, monospace"
      >
        DEBUG WALL · dashed = hotspot r · green dash = ~sep vs md
      </text>
    </svg>
  );
}
