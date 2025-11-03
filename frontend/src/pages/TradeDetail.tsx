// src/pages/TradeDetail.tsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PositionDetail = {
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

function formatDateTime(s?: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleString();
}

export default function TradeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const pid = Number(id);

  const [pos, setPos] = React.useState<PositionDetail | null>(null);
  const [funding, setFunding] = React.useState<FundingRow[]>([]);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      const p = await api.getPosition(pid);
      if (alive) setPos(p);
      try {
        const f = await api.getFunding(pid);
        if (alive) setFunding(f);
      } catch {
        // optional
      }
    }
    if (pid) load();
    return () => {
      alive = false;
    };
  }, [pid]);

  if (!pos) {
    return <div className="p-6">Lade Trade...</div>;
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{pos.symbol}</h1>
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
          {pos.bot_name ? <p className="text-sm text-muted-foreground mt-1">Bot: {pos.bot_name}</p> : null}
        </div>
        <Button variant="outline" onClick={() => nav(-1)}>
          Zurück
        </Button>
      </div>

      {/* Preise */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Entry (effektiv)</p>
          <p className="text-xl font-mono">{entry != null ? entry.toFixed(6) : "-"}</p>
          <p className="text-xs text-muted-foreground mt-1">(vwap → best → trigger)</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">{isClosed ? "Exit-Preis (VWAP)" : "Aktueller Preis"}</p>
          <p className="text-xl font-mono">{priceNow != null ? priceNow.toFixed(6) : "-"}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">{isClosed ? "Realized PnL" : "Unrealized PnL"}</p>
          <p
            className={cn(
              "text-xl font-semibold",
              pnl >= 0 ? "text-emerald-500" : "text-rose-500"
            )}
          >
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)} USDT
          </p>
        </div>
      </div>

      {/* Zeiten */}
      <div className="border rounded-lg p-4">
        <p className="text-xs text-muted-foreground mb-2">Zeiten</p>
        <div className="space-y-1 text-sm">
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

      {/* Kosten */}
      <div className="border rounded-lg p-4">
        <p className="text-xs text-muted-foreground mb-2">Transaktionskosten</p>
        <p className="text-lg font-mono mb-1">{totalCosts.toFixed(4)} USDT</p>
        <p className="text-sm text-muted-foreground">
          Open: {feeOpen.toFixed(4)} · Close: {feeClose.toFixed(4)} · Funding: {fundingTotal.toFixed(4)}
        </p>
      </div>

      {/* Funding Liste */}
      {funding.length > 0 ? (
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Funding</p>
          <div className="space-y-1">
            {funding.map((f) => (
              <div key={f.id} className="flex justify-between text-sm">
                <span>{formatDateTime(f.ts)}</span>
                <span>{f.amount_usdt.toFixed(6)} USDT</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
