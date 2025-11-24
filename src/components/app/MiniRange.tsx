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
  entryBest?: number | null; // für präzise Dezimalstellen
  exitBest?: number | null; // für präzise Dezimalstellen
};

// Formatierung mit gleicher Dezimalstellen-Logik wie in TradeDetail.tsx
function formatWithBestDecimals(value: number | null | undefined, best: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";

  // Wenn kein "best"-Wert da ist → normal mit max. 8 Nachkommastellen
  if (best == null || Number.isNaN(Number(best))) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: 8,
    });
  }

  const refStr = String(best);
  const dot = refStr.indexOf(".");
  const decimals = dot >= 0 ? refStr.length - dot - 1 : 0;

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Layout-Feinjustage (global)
const TRACK_Y_ADJUST_PX = -6; // + runter, - rauf
const LABEL_GAP_PX = -11; // vertikal (Tip → Text)
const LABEL_SIDE_GAP_PX = 5; // seitlich (Text ↔ Strich)

function labelLeft(xPct: number, align: "left" | "center" | "right") {
  if (align === "left") return `calc(${xPct}% + ${LABEL_SIDE_GAP_PX}px)`;
  if (align === "right") return `calc(${xPct}% - ${LABEL_SIDE_GAP_PX}px)`;
  return `${xPct}%`;
}

export default function MiniRange({ sl, entry, tp, mark, labelEntry = "ENTRY", side = "long", entryBest, exitBest }: Props) {
  // Wenn kein TP und SL: Entry unten, Exit/Mark oben
  // Links = kleinerer Wert, Rechts = größerer Wert
  if ((sl == null || tp == null) && entry != null) {
    const minPrice = mark != null ? Math.min(entry, mark) : entry;
    const maxPrice = mark != null ? Math.max(entry, mark) : entry;
    
    // Entry ist IMMER unten, Mark ist IMMER oben
    // Links = kleinerer Wert, Rechts = größerer Wert
    const isEntryLeft = entry <= (mark ?? entry);
    
    const hasProfit =
      mark != null && entry != null && ((side === "long" && mark > entry) || (side === "short" && mark < entry));
    const barColor = "bg-zinc-400 dark:bg-zinc-600";
    const segmentColor = mark != null ? (hasProfit ? "bg-success" : "bg-danger") : "";
    
    const BAR_THICK_PX = 6;
    const H_ENTRY = 18;
    const H_MARK = 14;
    const LABEL_GAP_PX = 3;

    return (
      <div className="py-1 px-0 pb-5">
        <div className="relative" style={{ height: BAR_THICK_PX + H_ENTRY + LABEL_GAP_PX + 18 }}>
          <div className="absolute inset-x-0" style={{ height: BAR_THICK_PX, top: "50%", transform: "translateY(-50%)" }}>
            {/* Base bar */}
            <div className={`absolute inset-0 ${barColor} rounded`} />
            
            {/* Colored segment if mark exists */}
            {mark != null && (
              <div
                className={`absolute ${segmentColor}`}
                style={{
                  top: 0,
                  height: BAR_THICK_PX,
                  left: isEntryLeft ? 0 : undefined,
                  right: !isEntryLeft ? 0 : undefined,
                  width: "100%",
                }}
              />
            )}
            
            {/* Entry tick - IMMER UNTEN, Position links oder rechts je nach Wert */}
            <div className="absolute inset-0">
              <div
                className="absolute bg-zinc-500"
                style={{
                  [isEntryLeft ? 'left' : 'right']: 0,
                  top: BAR_THICK_PX,
                  width: 2,
                  height: H_ENTRY,
                }}
              />
              <div
                className="absolute whitespace-nowrap text-[10px] leading-tight"
                style={{
                  [isEntryLeft ? 'left' : 'right']: isEntryLeft ? 5 : 5,
                  top: BAR_THICK_PX + H_ENTRY + LABEL_GAP_PX,
                }}
              >
                <span className="text-zinc-400">{labelEntry}</span>
                <span className="mx-[3px]" />
                <span className="text-foreground tabular-nums">{formatWithBestDecimals(entry, entryBest)}</span>
              </div>
              
              {/* Mark tick - IMMER OBEN, Position rechts oder links (gegenteil von Entry) */}
              {mark != null && (
                <>
                  <div
                    className="absolute bg-zinc-700 dark:bg-zinc-200"
                    style={{
                      [!isEntryLeft ? 'left' : 'right']: 0,
                      bottom: BAR_THICK_PX,
                      width: 2,
                      height: H_MARK,
                    }}
                  />
                  <div
                    className="absolute whitespace-nowrap text-[11px] font-medium"
                    style={{
                      [!isEntryLeft ? 'left' : 'right']: 0,
                      bottom: BAR_THICK_PX + H_MARK + LABEL_GAP_PX,
                    }}
                  >
                    {(() => {
                      const pct = ((mark - entry) / entry) * 100;
                      const hasProfit = (side === "long" && mark > entry) || (side === "short" && mark < entry);
                      const color = hasProfit ? "#2DFB68" : "#EA3A10";
                      return (
                        <>
                          <span style={{ color }}>{`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</span>
                          <span className="ml-1 text-zinc-500 dark:text-zinc-400">{formatWithBestDecimals(mark, entryBest ?? exitBest)}</span>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vollständige Ansicht mit SL/TP/Entry/Mark
  if (sl == null || entry == null || tp == null) {
    return null;
  }

  // --- layout constants
  const BAR_THICK_PX = 6;
  const LABEL_GAP_PX = 3;

  // Bestimme Links und Rechts basierend auf Werten (kleinster links, größter rechts)
  const allValues = [sl, tp, entry, mark].filter((v): v is number => v != null);
  const leftVal = Math.min(...allValues);
  const rightVal = Math.max(...allValues);
  const span = Math.max(1e-12, Math.abs(rightVal - leftVal));
  const toPct = (v: number) => ((v - leftVal) / span) * 100;
  const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

  const xSL = clamp01(toPct(sl));
  const xTP = clamp01(toPct(tp));
  const xEN = clamp01(toPct(entry));
  const xMK = mark == null ? null : clamp01(toPct(mark));

  // Labels alignment
  const isSLLeft = xSL <= xTP;
  const alignSL: "left" | "right" = isSLLeft ? "left" : "right";
  const alignTP: "left" | "right" = isSLLeft ? "right" : "left";
  const alignEN: "left" | "right" = xEN > 85 ? "right" : "left";
  const alignMK: "left" | "right" = xMK == null ? "left" : xMK > 85 ? "right" : "left";

  const fmt = (v: number | null | undefined, best: number | null | undefined) =>
    formatWithBestDecimals(v, best);

  const pct = mark != null && entry ? ((mark - entry) / entry) * 100 : null;
  const hasProfit =
    mark != null && entry != null && ((side === "long" && mark > entry) || (side === "short" && mark < entry));
  const gainColor = hasProfit ? "#2DFB68" : "#EA3A10";
  const segmentColor = hasProfit ? "bg-success" : "bg-danger";

  const H_BAR = BAR_THICK_PX;
  const H_SLTP = Math.round(H_BAR * 5);
  const H_ENTRY = Math.round(H_BAR * 3);
  const H_MARK = Math.round(H_BAR * 2.4);

  return (
    <div className="py-1 px-0 pb-5">
      <div className="relative" style={{ height: H_BAR + H_SLTP + LABEL_GAP_PX + 18 }}>
        <div className="absolute inset-x-0" style={{ height: H_BAR, top: "50%", transform: "translateY(-50%)" }}>
          <div className="absolute inset-0 bg-zinc-400 dark:bg-zinc-600 rounded" />

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

          <div className="absolute inset-0">
            {/* SL tick - UNTEN */}
            <Tick
              xPct={xSL}
              align={alignSL}
              direction="down"
              heightPx={H_SLTP}
              colorClass="bg-danger"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX - 5}
              title={<span style={{ color: "#EA3A10" }}>SL</span>}
              value={<span className="text-foreground tabular-nums">{fmt(sl, entryBest)}</span>}
            />

            {/* ENTRY tick - UNTEN, leicht erhöht */}
            <Tick
              xPct={xEN}
              align={alignEN}
              direction="down"
              heightPx={H_ENTRY}
              colorClass="bg-zinc-500"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX}
              title={<span className="text-zinc-400">{labelEntry}</span>}
              value={<span className="text-foreground tabular-nums">{fmt(entry, entryBest)}</span>}
            />

            {/* TP tick - UNTEN */}
            <Tick
              xPct={xTP}
              align={alignTP}
              direction="down"
              heightPx={H_SLTP}
              colorClass="bg-success"
              barHeightPx={H_BAR}
              labelGapPx={LABEL_GAP_PX - 5}
              title={<span style={{ color: "#2DFB68" }}>TP</span>}
              value={<span className="text-foreground tabular-nums">{fmt(tp, entryBest)}</span>}
            />

            {/* MARK tick - OBEN */}
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
                  entryBest={entryBest}
                  exitBest={exitBest}
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
  entryBest,
  exitBest,
}: {
  xPct: number;
  align: "left" | "center" | "right";
  barHeightPx: number;
  tickHeightPx: number;
  labelGapPx: number;
  percent: number | null;
  price: number | null | undefined;
  percentColor: string;
  entryBest?: number | null;
  exitBest?: number | null;
}) {
  const getTransform = () => {
    if (align === "left") return "translateX(0)";
    if (align === "right") return "translateX(-100%)";
    return "translateX(-50%)";
  };

  const top = `calc(0px - ${tickHeightPx}px - ${labelGapPx}px)`;

  return (
    <div
      className="absolute whitespace-nowrap text-[11px] font-medium"
      style={{ left: labelLeft(xPct, align), top, transform: getTransform() }}
    >
      {percent != null && (
        <span style={{ color: percentColor }}>{`${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`}</span>
      )}
      {price != null && <span className="ml-1 text-zinc-500 dark:text-zinc-400">{formatWithBestDecimals(price, entryBest ?? exitBest)}</span>}
    </div>
  );
}
