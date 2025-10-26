// src/components/app/MiniRange.tsx
// Flat range widget with gutters + precise alignment.
// SL left (red, down, 2×); TP right (green, down, 2×); ENTRY (grey, down, 1.5×); MARK (grey, up, 1.5×).
// Labels sit at the tip end with 3px gap. All elements respect gutters.

import React from 'react';

type Props = {
  sl?: number | null;
  entry?: number | null;
  tp?: number | null;
  mark?: number | null;      // current or exit price
  labelEntry?: string;       // default: 'ENTRY'
};

// Layout-Feinjustage (global)
const TRACK_Y_ADJUST_PX = -6;   // + runter, - rauf
const LABEL_GAP_PX = -11;        // vertikal (Tip → Text)
const LABEL_SIDE_GAP_PX = 5;   // seitlich (Text ↔ Strich)

function labelLeft(xPct: number, align: 'left'|'center'|'right') {
  if (align === 'left')  return `calc(${xPct}% + ${LABEL_SIDE_GAP_PX}px)`;
  if (align === 'right') return `calc(${xPct}% - ${LABEL_SIDE_GAP_PX}px)`;
  return `${xPct}%`;
}

export default function MiniRange({
  sl, entry, tp, mark, labelEntry = 'ENTRY',
}: Props) {
  if (sl == null || entry == null || tp == null) {
    return (
      <div className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-background flex items-center justify-center text-xs text-muted-foreground">
        No SL/TP
      </div>
    );
  }

  // --- layout constants
  const GUTTER_PX = 24;         // inner left/right padding for everything
  const BAR_THICK_PX = 6;       // ~2x thicker bar
  const LABEL_GAP_PX = 3;       // distance between tick tip and label

  // fixed orientation: left = SL, right = TP
  const leftVal = sl;
  const rightVal = tp;
  const span = Math.max(1e-12, Math.abs(rightVal - leftVal));
  const toPct = (v: number) => ((v - leftVal) / span) * (rightVal >= leftVal ? 100 : -100);
  const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

  const xSL = 0;
  const xTP = 100;
  const xEN = clamp01(toPct(entry));
  const xMK = mark == null ? null : clamp01(toPct(mark));

  // label align so we don’t overflow near edges
  const alignFor = (x: number): 'left' | 'center' | 'right' => x > 90 ? 'right' : 'left';
  const alignSL: 'left' = 'left';
  const alignTP: 'right' = 'right';
  const alignEN = alignFor(xEN);
  const alignMK = xMK == null ? 'center' : alignFor(xMK);

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 6 });

  // gain/loss logic
  const pct = mark != null && entry ? ((mark - entry) / entry) * 100 : null;
  const inGain = mark != null && entry != null && mark >= entry && mark <= tp;
  const inLoss = mark != null && entry != null && mark <= entry && mark >= sl;
  const gainColor = inGain ? 'text-emerald-500' : inLoss ? 'text-red-500' : 'text-zinc-400';
  const segmentColor = inGain ? 'bg-emerald-600' : inLoss ? 'bg-red-600' : 'bg-zinc-400/50';

  // tick heights (relative to bar thickness)
  const H_BAR = BAR_THICK_PX;
  const H_SLTP = Math.round(H_BAR * 4);    // 2×
  const H_ENTRY = Math.round(H_BAR * 3); // 1.5×
  const H_MARK = Math.round(H_BAR * 2.4);  // 1.5×

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-background px-3 py-2">
      <div className="relative" style={{ height: H_BAR + 28 }}>
        {/* TRACK WRAPPER: everything inside respects gutters via inset-x style */}
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2" style={{ height: H_BAR }}>
          {/* thick neutral bar */}
          <div className="absolute inset-0 bg-zinc-300 dark:bg-zinc-600 rounded" />

          {/* colored segment (fills full bar height) */}
          {xMK != null && (
            <div
              className={`absolute ${segmentColor}`}
              style={{
                top: 0,
                height: H_BAR,
                left: `${Math.min(xEN, xMK)}%`,
                width: `${Math.abs(xMK - xEN)}%`,
              }}
            />
          )}

          {/* TICKS live in a relative layer over the track */}
          <div className="absolute inset-0">
            {/* SL tick (down) */}
            <Tick
              xPct={xSL}
              align={alignSL}
              direction="down"
              heightPx={H_SLTP}
              colorClass="bg-red-600"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX}
              title={<span className="text-red-500">SL</span>}
              value={<span className="text-foreground tabular-nums">{fmt(sl)}</span>}
            />

            {/* ENTRY tick (down) */}
            <Tick
              xPct={xEN}
              align={alignEN}
              direction="down"
              heightPx={H_ENTRY}
              colorClass="bg-zinc-500"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX}
              title={<span className="text-zinc-400">{labelEntry}</span>}
              value={<span className="text-foreground tabular-nums">{fmt(entry)}</span>}
            />

            {/* TP tick (down) */}
            <Tick
              xPct={xTP}
              align={alignTP}
              direction="down"
              heightPx={H_SLTP}
              colorClass="bg-emerald-600"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX}
              title={<span className="text-emerald-500">TP</span>}
              value={<span className="text-foreground tabular-nums">{fmt(tp)}</span>}
            />

            {/* MARK tick (up) + label above with % then price */}
            {xMK != null && (
              <>
                <Tick
                  xPct={xMK}
                  align={alignMK}
                  direction="up"
                  heightPx={H_MARK}
                  colorClass="bg-zinc-700 dark:bg-zinc-200"
                  barHeightPx={H_BAR}
                  labelGapPx={LABEL_GAP_PX}
                />
                <MarkLabel
                  xPct={xMK}
                  align={alignMK}
                  barHeightPx={H_BAR}
                  tickHeightPx={H_MARK}
                  labelGapPx={LABEL_GAP_PX}
                  percent={pct}
                  price={mark}
                  percentClass={gainColor}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Tick draws ONLY the vertical line and (optionally) a label.
 * It is positioned inside the track wrapper, so % values already respect gutters.
 * For direction:
 *  - 'down': line starts at bar BOTTOM (100%) and goes downward by heightPx
 *  - 'up':   line starts at bar TOP (0%) and goes upward by heightPx
 */
function Tick({
  xPct,
  align,
  direction,
  heightPx,
  colorClass,
  barHeightPx,
  labelGapPx,
  title,
  value,
}: {
  xPct: number;
  align: 'left' | 'center' | 'right';
  direction: 'up' | 'down';
  heightPx: number;
  colorClass: string;
  barHeightPx: number;
  labelGapPx: number;
  title?: React.ReactNode;
  value?: React.ReactNode;
}) {
  const tx = align === 'left' ? 'translateX(0)' : align === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';

  // vertical anchor at bar edge
  const baseTop = direction === 'down' ? barHeightPx : -8;
  const lineTop  = baseTop + TRACK_Y_ADJUST_PX;
  const labelTop = direction === 'down'
    ? (barHeightPx + heightPx + LABEL_GAP_PX + TRACK_Y_ADJUST_PX)   // unter der Spitze
    : (0 - heightPx - LABEL_GAP_PX + TRACK_Y_ADJUST_PX);            // über der Spitze
  
    return (
    <>
      {/* vertical line */}
      <div
        className={`absolute ${colorClass}`}
        style={{
          left: `${xPct}%`,
          top: lineTop,
          width: 2,
          height: heightPx,
          transform: tx,
        }}
      />
      {/* SL/ENTRY/TP labels (only for 'down'; MARK uses its own label component) */}
      {direction === 'down' && (title || value) && (
        <div
          className="absolute whitespace-nowrap text-[10px] leading-tight"
          style={{ left: labelLeft(xPct, align), top: labelTop, transform: tx }}
        >
          {title}
          {title && value ? <span className="mx-[3px]" /> : null}
          {value}
        </div>
      )}
    </>
  );
}

function MarkLabel({
  xPct,
  align,
  barHeightPx,
  tickHeightPx,
  labelGapPx,
  percent,
  price,
  percentClass,
}: {
  xPct: number;
  align: 'left' | 'center' | 'right';
  barHeightPx: number;
  tickHeightPx: number;
  labelGapPx: number;
  percent: number | null;
  price: number | null | undefined;
  percentClass: string;
}) {
  const tx = align === 'left' ? 'translateX(0)' : align === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
  const top = `calc(0px - ${tickHeightPx}px - ${labelGapPx}px)`;
  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 6 });

  return (
    <div
      className="absolute whitespace-nowrap text-[11px] font-medium"
      style={{ left: labelLeft(xPct, align), top, transform: tx }}
    >
      {percent != null && (
        <span className={percentClass}>
          {`${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`}
        </span>
      )}
      {price != null && <span className="ml-1 text-zinc-500 dark:text-zinc-400">{fmt(price)}</span>}
    </div>
  );
}
