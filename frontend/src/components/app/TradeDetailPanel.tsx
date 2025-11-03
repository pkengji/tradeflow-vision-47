// src/components/app/TradeDetailPanel.tsx
import React from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BasePosition = {
  id: number;
  status: "open" | "closed";
  symbol: string;
  side?: "long" | "short" | null;
  bot_id?: number | null;
  bot_name?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  qty?: number | null;
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

type FundingRow = {
  id: number;
  amount_usdt: number;
  ts: string;
};

type Props = {
  position?: BasePosition | null;
  positionId?: number | null;
  onClose?: () => void;
  onRefresh?: () => void;
};

function formatDateTime(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleString();
}

function formatNum(v?: number | null, digits = 4) {
  if (v == null) return "-";
  return v.toFixed(digits);
}

export default function TradeDetailPanel({ position, positionId, onClose, onRefresh }: Props) {
  const [pos, setPos] = React.useState<BasePosition | null>(position ?? null);
  const [funding, setFunding] = React.useState<FundingRow[]>([]);
  const effectiveId = position?.id ?? positionId ?? null;

  React.useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!effectiveId) return;
      const p = await api.getPosition(effectiveId);
      if (isMounted) setPos(p);

      // Funding nachladen (falls vorhanden)
      try {
        const f = await api.getFunding(effectiveId);
        if (isMounted) setFunding(f);
      } catch {
        // wenn Endpoint (noch) nicht da ist → einfach ignorieren
      }
    }

    // nur laden, wenn wir keine fertige Position als Prop bekommen haben
    if (!position && effectiveId) {
      load();
    }

    return () => {
      isMounted = false;
    };
  }, [effectiveId, position]);

  if (!pos) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h3 className="font-semibold">Trade Details</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="p-4 text-muted-foreground text-sm">Kein Trade ausgewählt.</div>
      </div>
    );
  }

  const entry =
    pos.entry_price_vwap ??
    pos.entry_price_best ??
    pos.entry_price_trigger ??
    null;

  const isClosed = pos.status === "closed";
  const priceNow = isClosed ? pos.exit_price_vwap ?? null : pos.mark_price ?? null;
  const pnl = isClosed ? pos.pnl_usdt ?? 0 : pos.unrealized_pnl_usdt ?? 0;

  const fundingTotal = funding.reduce((acc, f) => acc + (f.amount_usdt ?? 0), 0);
  const feeOpen = pos.fee_open_usdt ?? 0;
  const feeClose = pos.fee_close_usdt ?? 0;
  const totalCosts = feeOpen + feeClose + fundingTotal;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b bg-background/50 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{pos.symbol}</h3>
            {pos.side ? (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  pos.side === "long" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                )}
              >
                {pos.side.toUpperCase()}
              </span>
            ) : null}
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                isClosed ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-500"
              )}
            >
              {isClosed ? "Geschlossen" : "Offen"}
            </span>
          </div>
          {pos.bot_name ? (
            <p className="text-xs text-muted-foreground mt-0.5">Bot: {pos.bot_name}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Aktualisieren
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-auto">
        {/* Preise */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Entry (effektiv)</p>
            <p className="text-lg font-mono">{entry ? entry.toFixed(6) : "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              (vwap → best → trigger)
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">
              {isClosed ? "Exit-Preis (VWAP)" : "Aktueller Preis"}
            </p>
            <p className="text-lg font-mono">
              {priceNow != null ? priceNow.toFixed(6) : "-"}
            </p>
          </div>
        </div>

        {/* PnL & Costs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">
              {isClosed ? "Realized PnL" : "Unrealized PnL"}
            </p>
            <p
              className={cn(
                "text-lg font-semibold",
                pnl >= 0 ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {pnl >= 0 ? "+" : ""}
              {pnl.toFixed(2)} USDT
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Transaktionskosten</p>
            <p className="text-lg font-mono">{totalCosts.toFixed(4)} USDT</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open: {feeOpen.toFixed(4)} · Close: {feeClose.toFixed(4)} · Funding:{" "}
              {fundingTotal.toFixed(4)}
            </p>
          </div>
        </div>

        {/* Zeiten */}
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground mb-1">Zeiten</p>
          <div className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Geöffnet: </span>
              {formatDateTime(pos.opened_at)}
            </div>
            <div>
              <span className="text-muted-foreground">Geschlossen: </span>
              {isClosed ? formatDateTime(pos.closed_at) : "—"}
            </div>
          </div>
        </div>

        {/* Funding-Liste (falls vorhanden) */}
        {funding.length > 0 ? (
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-2">Funding</p>
            <div className="space-y-1 text-sm">
              {funding.map((f) => (
                <div key={f.id} className="flex justify-between">
                  <span>{formatDateTime(f.ts)}</span>
                  <span>{f.amount_usdt.toFixed(6)} USDT</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
