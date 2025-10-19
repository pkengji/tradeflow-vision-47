// src/pages/Trades.tsx
import { useEffect, useMemo, useState } from 'react';
import { actions, apiRequest } from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import TradeCardCompact from '@/components/app/TradeCardCompact';
import ResponsivePanel from '@/components/ui/ResponsivePanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TradeSide = 'long' | 'short';
type TradeStatus = 'open' | 'closed';

type Trade = {
  id: number;
  symbol: string;
  side: TradeSide;
  botId?: number;
  botName?: string;
  status: TradeStatus;
  pnl_usdt?: number;          // realized (closed) oder unrealized (open) – je nach Backend-Feld
  deltaPct?: number;          // Bewegung Entry -> Now/Close in %
  entryPrice?: number;
  sl?: number | null;
  tp?: number | null;
  currentPrice?: number;      // für offene Trades
  closePrice?: number | null; // für geschlossene Trades
};

function ExportCSVButton({ url, filename }: { url: string; filename: string }) {
  const onClick = async () => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { alert('CSV-Export fehlgeschlagen'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <button className="px-3 py-1 rounded border" onClick={onClick}>CSV exportieren</button>;
}

// Einfache, eigenständige Tick-Komponente
function Tick({ xPct, label, cls, hollow }: { xPct: number; label: string; cls?: string; hollow?: boolean }) {
  const style = { left: `${Math.max(0, Math.min(100, xPct))}%` };
  return (
    <div className="absolute -translate-x-1/2 top-0 h-full" style={style}>
      <div
        className={`w-[2px] h-full ${hollow ? 'bg-transparent border' : ''} ${cls ?? 'bg-primary'}`}
        title={label}
      />
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap">{label}</div>
    </div>
  );
}

// Preisleiste, berechnet alle X-Positionen selbst – keine Fremd-Abhängigkeiten nötig
function PriceBar({
  entry, sl, tp, now,
  side,
}: {
  entry?: number; sl?: number | null; tp?: number | null; now?: number | null; side: TradeSide;
}) {
  const { min, max } = useMemo(() => {
    const vals = [entry, sl ?? undefined, tp ?? undefined, now ?? undefined].filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return { min: 0, max: 1 };
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // falls alles gleich, Range leicht aufziehen
    return lo === hi ? { min: lo * 0.999, max: hi * 1.001 } : { min: lo, max: hi };
  }, [entry, sl, tp, now]);

  const px = (v?: number | null) => {
    if (typeof v !== 'number') return null;
    return ((v - min) / (max - min)) * 100;
  };

  const xEN = px(entry) ?? 0;
  const xSL = px(sl ?? undefined);
  const xTP = px(tp ?? undefined);
  const xNOW = px(now ?? undefined);

  // Fläche zwischen Entry und Now einfärben (grün bei Gewinn, rot bei Verlust – je nach Long/Short)
  const gain = (() => {
    if (typeof entry !== 'number' || typeof now !== 'number') return false;
    const diff = side === 'long' ? now - entry : entry - now;
    return diff >= 0;
  })();

  const left = Math.min(xEN, xNOW ?? xEN);
  const right = Math.max(xEN, xNOW ?? xEN);

  return (
    <div className="relative h-10 rounded bg-muted px-2">
      {/* Grundlinie */}
      <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-border" />
      {/* Füllfläche */}
      <div
        className={`absolute top-1/4 h-1/2 rounded ${gain ? 'bg-emerald-500/40' : 'bg-red-500/40'}`}
        style={{ left: `calc(2px + ${left}%)`, right: `calc(2px + ${100 - right}%)` }}
      />
      {/* Ticks */}
      <Tick xPct={xEN} label="ENTRY" cls="bg-primary" />
      {xSL != null && <Tick xPct={xSL} label="SL" cls="bg-red-500" />}
      {xTP != null && <Tick xPct={xTP} label="TP" cls="bg-emerald-600" />}
      {xNOW != null && <Tick xPct={xNOW} label="NOW" cls="bg-zinc-800" hollow />}
    </div>
  );
}

export default function Trades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open');
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: 'all',
  });

  // Beispiel: Trades laden – passe den Endpoint an deine API an
  useEffect(() => {
    (async () => {
      try {
        // Erwartet ein Array von Trades; passe Mapping ggf. an dein Backend an:
        const res = await apiRequest<Trade[]>('/api/v1/trades'); // <- falls dein Endpoint anders heißt: anpassen
        setTrades(res || []);
      } catch (e) {
        console.error(e);
        // Fallback: leere Liste
        setTrades([]);
      }
    })();
  }, []);

  const openDetail = (t: Trade) => {
    setSelected(t);
    setPanelOpen(true);
  };

  const closeDetail = () => {
    setPanelOpen(false);
    setSelected(null);
  };

  // Helper: P&L + Delta anzeigen
  const pnlDisplay = (t: Trade) => {
    const v = t.pnl_usdt ?? 0;
    return { pnl: v, deltaPct: t.deltaPct ?? 0 };
  };

  // Gefilterte Trades basierend auf Tab + Filter
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // Tab-Filter: open/closed
      if (t.status !== activeTab) return false;
      // Bot-Filter
      if (filters.botIds.length > 0 && !filters.botIds.includes(t.botId ?? 0)) return false;
      // Symbol-Filter
      if (filters.symbols.length > 0 && !filters.symbols.includes(t.symbol)) return false;
      // Side-Filter
      if (filters.side && filters.side !== 'all' && t.side !== filters.side) return false;
      return true;
    });
  }, [trades, activeTab, filters]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trades</h1>
        <ExportCSVButton url={`/api/v1/export/trades`} filename="trades.csv" />
      </div>

      <TradesFiltersBar
        value={filters}
        onChange={setFilters}
        availableBots={[
          { id: 1, name: 'Bot Alpha' },
          { id: 2, name: 'Bot Beta' },
          { id: 3, name: 'Bot Gamma' }
        ]}
        availableSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']}
      />

      {/* Tabs für Open/Closed */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'closed')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="open">Offen</TabsTrigger>
          <TabsTrigger value="closed">Geschlossen</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-2 mt-4">
          {filteredTrades.map((t) => {
            const { pnl, deltaPct } = pnlDisplay(t);
            return (
              <div key={t.id} className="space-y-2">
                <TradeCardCompact
                  symbol={t.symbol}
                  botName={t.botName}
                  side={t.side}
                  pnl={pnl}
                  deltaPct={(deltaPct || 0) / 100} // erwartet 0..1 → falls du schon 0..1 bekommst: diesen /100 entfernen
                  onClick={() => openDetail(t)}
                />
                {/* Preisleiste pro Trade */}
                <PriceBar
                  entry={t.entryPrice}
                  sl={t.sl ?? undefined}
                  tp={t.tp ?? undefined}
                  now={(t.status === 'open' ? t.currentPrice : t.closePrice) ?? undefined}
                  side={t.side}
                />
              </div>
            );
          })}
          {filteredTrades.length === 0 && (
            <div className="text-sm text-muted-foreground">Keine Trades gefunden.</div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail-Panel mit Aktionen */}
      <ResponsivePanel open={panelOpen} onClose={closeDetail}>
        {selected && (
          <div className="space-y-3">
            <div className="text-lg font-semibold">{selected.symbol} <span className="uppercase text-xs text-muted-foreground">{selected.side}</span></div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Bot: <span className="text-muted-foreground">{selected.botName ?? '—'}</span></div>
              <div>Status: <span className="text-muted-foreground">{selected.status}</span></div>
              <div>Entry: <span className="text-muted-foreground">{selected.entryPrice ?? '—'}</span></div>
              <div>SL: <span className="text-muted-foreground">{selected.sl ?? '—'}</span></div>
              <div>TP: <span className="text-muted-foreground">{selected.tp ?? '—'}</span></div>
              <div>Now/Close: <span className="text-muted-foreground">{(selected.status === 'open' ? selected.currentPrice : selected.closePrice) ?? '—'}</span></div>
              <div>P&L (USDT): <span className={`font-medium ${ (selected.pnl_usdt ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(selected.pnl_usdt ?? 0).toFixed(2)}</span></div>
              <div>Δ (%): <span className={`font-medium ${ (selected.deltaPct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(selected.deltaPct ?? 0).toFixed(2)}</span></div>
            </div>

            <div className="pt-2 border-t">
              <ActionsBar trade={selected} onChanged={async () => {
                // Nach Aktion neu laden
                try {
                  const res = await apiRequest<Trade[]>('/api/v1/trades');
                  setTrades(res || []);
                } catch {}
              }} />
            </div>
          </div>
        )}
      </ResponsivePanel>
    </div>
  );
}

function ActionsBar({ trade, onChanged }: { trade: Trade; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);

  const setBoth = async () => {
    const rawTp = prompt('TP Trigger (leer = kein Update)');
    const rawSl = prompt('SL Trigger (leer = kein Update)');
    const tp = rawTp === null || rawTp.trim() === '' ? null : Number(rawTp);
    const sl = rawSl === null || rawSl.trim() === '' ? null : Number(rawSl);

    setBusy(true);
    try {
      await actions.setTpSl(trade.id, { tp, sl });
      alert('TP/SL aktualisiert');
      await onChanged();
    } catch (e: any) {
      alert(`Fehler: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const closeNow = async () => {
    if (!confirm('Position wirklich sofort (Market) schließen?')) return;
    setBusy(true);
    try {
      await actions.closePosition(trade.id);
      alert('Position geschlossen (Market)');
      await onChanged();
    } catch (e: any) {
      alert(`Fehler: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button className="px-3 py-1 rounded border" onClick={setBoth} disabled={busy}>TP/SL setzen</button>
      <button className="px-3 py-1 rounded border" onClick={closeNow} disabled={busy}>Close (Market)</button>
    </div>
  );
}
