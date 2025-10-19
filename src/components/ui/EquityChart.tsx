
import { useEffect, useRef } from "react";

type Point = { ts: string; day_pnl: number };
export default function EquityChart({ data }: { data: Point[] }){
  // Simple inline SVG; no external lib needed
  const width = 600, height = 180, pad = 24;
  if (!data || data.length===0) return <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Keine Daten</div>;
  const xs = data.map(d=>new Date(d.ts).getTime());
  const ys = data.map(d=>d.day_pnl);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  const x = (t:number)=> pad + ( (t - minX) / (maxX - minX || 1) ) * (width - 2*pad);
  const y = (v:number)=> height - pad - ( (v - minY) / (maxY - minY || 1) ) * (height - 2*pad);
  const path = ys.map((v,i)=> (i===0?`M ${x(xs[i])} ${y(v)}`:`L ${x(xs[i])} ${y(v)}`)).join(" ");
  return (
    <svg width={width} height={height} className="w-full h-[180px]">
      <rect x={0} y={0} width={width} height={height} fill="transparent" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {/* zero line */}
      <line x1={pad} y1={y(0)} x2={width-pad} y2={y(0)} stroke="currentColor" opacity={0.2} />
    </svg>
  );
}
