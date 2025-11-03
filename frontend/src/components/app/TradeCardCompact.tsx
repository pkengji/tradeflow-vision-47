// src/components/app/TradeCardCompact.tsx
import React from "react";
import { cn } from "@/lib/utils";
import MiniRange from "@/components/app/MiniRange";

export type CompactTrade = {
  id: number;
  status: "open" | "closed";
  symbol: string;
  side?: "long" | "short" | null;
  bot_id?: number | null;
  bot_name?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  qty?: number | null;
  // neue Felder:
  entry_price_vwap?: number | null;
  entry_price_best?: number | null;
  entry_price_trigger?: number | null;
  exit_price_vwap?: number | null;
  mark_price?: number | null;
  pnl_usdt?: number | null;
  unrealized_pnl_usdt?: number | null;
  fee_open_usdt?: number | null;
  fee_close_usdt?: number | null;
};

type Props = {
  trade: CompactTrade;
  onSelect?: (id: number) => void;
  isSelected?: boolean;
};

function formatPnL(v?: number | null): string {
  if (v == null) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + " USDT";
}

function formatDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TradeCardCompact({ trade, onSelect, isSelected }: Props) {
  const entry =
    trade.entry_price_vwap ??
    trade.entry_price_best ??
    trade.entry_price_trigger ??
    null;

  const exitOrMark =
    trade.status === "closed"
      ? trade.exit_price_vwap ?? null
      : trade.mark_price ?? null;

  const pnl =
    trade.status === "closed"
      ? trade.pnl_usdt ?? 0
      : trade.unrealized_pnl_usdt ?? 0;

  const pnlPositive = pnl >= 0;

  return (
    <div
      onClick={() => onSelect?.(trade.id)}
      className={cn(
        "flex flex-col gap-1 px-3 py-2 rounded-md border cursor-pointer bg-background/30",
        isSelected ? "border-primary/80 bg-primary/5" : "border-border/50 hover:border-primary/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm">{trade.symbol}</span>
          {trade.side ? (
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                trade.side === "long" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              )}
            >
              {trade.side.toUpperCase()}
            </span>
          ) : null}
          {trade.bot_name ? (
            <span className="text-xs text-muted-foreground">· {trade.bot_name}</span>
          ) : null}
        </div>
        <div
          className={cn(
            "text-sm font-medium",
            pnlPositive ? "text-emerald-500" : "text-rose-500"
          )}
        >
          {formatPnL(pnl)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <MiniRange
          entry={entry ?? undefined}
          mark={trade.status === "open" ? trade.mark_price ?? undefined : undefined}
          tp={trade.status === "closed" ? exitOrMark ?? undefined : undefined}
          labelEntry="ENTRY"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {trade.status === "open" ? "Geöffnet" : "Geschlossen"}{" "}
          {formatDate(trade.status === "open" ? trade.opened_at : trade.closed_at)}
        </span>
        {trade.qty ? <span>{trade.qty} •</span> : <span />}
      </div>
    </div>
  );
}
