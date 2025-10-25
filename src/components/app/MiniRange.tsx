// src/components/app/MiniRange.tsx
// Flat range widget with gutters + precise alignment.
// SL left (red, down, 2×); TP right (green, down, 2×); ENTRY (grey, down, 1.5×); MARK (grey, up, 1.5×).
// Labels sit at the tip end with 3px gap. All elements respect gutters.

import React from "react";

type Props = {
  sl?: number | null;
  entry?: number | null;
  tp?: number | null;
  mark?: number | null; // current or exit price
  labelEntry?: string; // default: 'ENTRY'
  side?: "long" | "short"; // trade side for orientation
};

// Layout-Feinjustage (global)
const TRACK_Y_ADJUST_PX = -6; // + runter, - rauf
const LABEL_GAP_PX = -11; // vertikal (Tip → Text)
const LABEL_GAP_PX_SLTP = -20; // vertikal (Tip → Text)
const LABEL_SIDE_GAP_PX = 5; // seitlich (Text ↔ Strich)

function labelLeft(xPct: number, align: "left" | "center" | "right") {
  if (align === "left") return `calc(${xPct}% + ${LABEL_SIDE_GAP_PX}px)`;
  if (align === "right") return `calc(${xPct}% - ${LABEL_SIDE_GAP_PX}px)`;
  return `${xPct}%`;
}

export default function MiniRange({ sl, entry, tp, mark, labelEntry = "ENTRY", side = "long" }: Props) {
  // Simplified view: no SL/TP
  if ((sl == null || tp == null) && entry != null) {
    const minPrice = mark != null ? Math.min(entry, mark) : entry;
    const maxPrice = mark != null ? Math.max(entry, mark) : entry;
    const hasProfit =
      mark != null && entry != null && ((side === "long" && mark > entry) || (side === "short" && mark < entry));
    const barColor = mark != null ? (hasProfit ? "bg-success" : "bg-danger") : "bg-zinc-400";

    return (
      <div className="py-3 px-0 pb-5">
        <div className="relative h-2">
          <div className={`absolute inset-y-0 left-0 right-0 ${barColor} rounded`} />
          <div className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground">
            {labelEntry} {minPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          {mark != null && (
            <div className="absolute -bottom-5 right-0 text-[10px] text-muted-foreground text-right">
              {maxPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (sl == null || entry == null || tp == null) {
    return null;
  }

  // --- layout constants
  const BAR_THICK_PX = 6; // ~2x thicker bar
  const LABEL_GAP_PX = 3; // distance between tick tip and label

  // Dynamic orientation: lowest left, highest right
  const leftVal = Math.min(sl, tp);
  const rightVal = Math.max(sl, tp);
  const span = Math.max(1e-12, Math.abs(rightVal - leftVal));
  const toPct = (v: number) => ((v - leftVal) / span) * 100;
  const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

  const xSL = clamp01(toPct(sl));
  const xTP = clamp01(toPct(tp));
  const xEN = clamp01(toPct(entry));
  const xMK = mark == null ? null : clamp01(toPct(mark));

  // label align so we don't overflow near edges
  const alignFor = (x: number): "left" | "center" | "right" => {
    if (x < 15) return "left";
    if (x > 85) return "right";
    return "center";
  };

  // SL/TP alignment based on which is leftmost/rightmost on the track
  const isSLLeft = xSL <= xTP;
  const alignSL: "left" | "right" = isSLLeft ? "left" : "right";
  const alignTP: "left" | "right" = isSLLeft ? "right" : "left";

  // Entry/Mark prefer label to the right of the tick (left-aligned) unless near the right edge
  const alignEN: "left" | "right" = xEN > 85 ? "right" : "left";
  const alignMK: "left" | "right" = xMK == null ? "left" : xMK > 85 ? "right" : "left";

  const fmt = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 6 });

  // gain/loss logic based on side
  const pct = mark != null && entry ? ((mark - entry) / entry) * 100 : null;
  const hasProfit =
    mark != null && entry != null && ((side === "long" && mark > entry) || (side === "short" && mark < entry));
  const gainColor = hasProfit ? "#2DFB68" : "#EA3A10";
  const segmentColor = hasProfit ? "bg-success" : "bg-danger";

  // tick heights (relative to bar thickness)
  const H_BAR = BAR_THICK_PX;
  const H_SLTP = Math.round(H_BAR * 4); // 2×
  const H_ENTRY = Math.round(H_BAR * 3); // 1.5×
  const H_MARK = Math.round(H_BAR * 2.4); // 1.5×

  return (
    <div className="py-1 px-0 pb-5">
      <div className="relative" style={{ height: H_BAR + H_SLTP + LABEL_GAP_PX + 18 }}>
        {/* TRACK WRAPPER: everything inside respects gutters via inset-x style */}
        <div className="absolute inset-x-0" style={{ height: H_BAR, top: "50%", transform: "translateY(-50%)" }}>
          {/* thick neutral bar */}
          <div className="absolute inset-0 bg-zinc-400 dark:bg-zinc-600 rounded" />

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
              colorClass="bg-danger"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX_SLTP}
              title={<span style={{ color: "#EA3A10" }}>SL</span>}
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
              colorClass="bg-success"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX_SLTP}
              title={<span style={{ color: "#2DFB68" }}>TP</span>}
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
                  percentColor={gainColor}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  align: "left" | "center" | "right";
  direction: "up" | "down";
  heightPx: number;
  colorClass: string;
  barHeightPx: number;
  labelGapPx: number;
  title?: React.ReactNode;
  value?: React.ReactNode;
}) {
  // Transform based on alignment to prevent overflow
  const getTransform = () => {
    if (align === "left") return "translateX(0)"; // Start at position
    if (align === "right") return "translateX(-100%)"; // End at position
    return "translateX(-50%)"; // Center at position
  };

  // vertical anchor at bar edge
  const baseTop = direction === "down" ? barHeightPx : -8;
  const lineTop = baseTop + TRACK_Y_ADJUST_PX;
  const labelTop =
    direction === "down"
      ? barHeightPx + heightPx + LABEL_GAP_PX + TRACK_Y_ADJUST_PX // unter der Spitze
      : 0 - heightPx - LABEL_GAP_PX + TRACK_Y_ADJUST_PX; // über der Spitze

  const transform = getTransform();

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
          transform,
        }}
      />
      {/* SL/ENTRY/TP labels */}
      {direction === "down" && (title || value) && (
        <div
          className="absolute whitespace-nowrap text-[10px] leading-tight"
          style={{
            left: labelLeft(xPct, align),
            top: labelTop,
            transform,
          }}
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
  percentColor,
}: {
  xPct: number;
  align: "left" | "center" | "right";
  barHeightPx: number;
  tickHeightPx: number;
  labelGapPx: number;
  percent: number | null;
  price: number | null | undefined;
  percentColor: string;
}) {
  const getTransform = () => {
    if (align === "left") return "translateX(0)";
    if (align === "right") return "translateX(-100%)";
    return "translateX(-50%)";
  };

  const top = `calc(0px - ${tickHeightPx}px - ${labelGapPx}px)`;
  const fmt = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 6 });

  return (
    <div
      className="absolute whitespace-nowrap text-[11px] font-medium"
      style={{ left: labelLeft(xPct, align), top, transform: getTransform() }}
    >
      {percent != null && (
        <span style={{ color: percentColor }}>{`${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`}</span>
      )}
      {price != null && <span className="ml-1 text-zinc-500 dark:text-zinc-400">{fmt(price)}</span>}
    </div>
  );
}
