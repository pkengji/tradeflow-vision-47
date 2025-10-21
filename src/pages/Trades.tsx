// ==============================
// 1) IMPORTS
// ==============================
import { useEffect, useMemo, useState } from 'react';
import api, { type PositionListItem, type Bot } from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import TradeCardCompact from '@/components/app/TradeCardCompact';
import ResponsivePanel from '@/components/ui/ResponsivePanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import MiniRange from '@/components/app/MiniRange';
import TradeDetailPanel from '@/components/app/TradeDetailPanel';

// ==============================
// 2) LOCAL TYPES
// ==============================
type TabKey = 'open' | 'closed';

interface SelectedTrade { id: number; symbol: string; }

// ==============================
// 3) HELPERS (klein & testbar)
// ==============================
function safeNumber(n: number | null | undefined, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function combineDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr && !timeStr) return null;
  const [yy, mm, dd] = (dateStr ?? '').split('-');
  const [HH, MM] = (timeStr ?? '').split(':');
  const y = Number(yy), m = Number(mm), d = Number(dd), h = Number(HH), min = Number(MM);
  const hasDate = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d);
  const hasTime = Number.isFinite(h) && Number.isFinite(min);
  if (!hasDate && !hasTime) return null;
  const now = new Date();
  const year = hasDate ? y : now.getFullYear();
  const month = hasDate ? (m - 1) : now.getMonth();
  const day = hasDate ? d : now.getDate();
  const hour = hasTime ? h : 0;
  const minute = hasTime ? min : 0;
  const dt = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ==============================
// 4) COMPONENT
// ==============================
export default function Trades() {
  // ---- 4.1 STATE (UI & Daten) ----
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [filters, setFilters] = useState<TradesFilters>({ botIds: [], symbols: [], side: 'all' });

  const [positions, setPositions] = useState<PositionListItem[]>([]);
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Datum/Uhrzeit-Filter (nur für geschlossene Trades wirksam)
  const [closedDateFrom, setClosedDateFrom] = useState<string>(''); // yyyy-mm-dd
  const [closedTimeFrom, setClosedTimeFrom] = useState<string>(''); // HH:MM
  const [closedDateTo, setClosedDateTo] = useState<string>('');
  const [closedTimeTo, setClosedTimeTo] = useState<string>('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedTrade | null>(null);

  // ---- 4.2 EFFECTS: Daten laden ----
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        const res = await api.getPositions();
        if (!cancel) setPositions(Array.isArray(res?.items) ? res.items : []);
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? 'Unbekannter Fehler');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await api.getBots();
        if (!cancel) setBots((list as Bot[]).map(b => ({ id: b.id, name: b.name })));
      } catch {}
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await api.getSymbols();
        if (!cancel) setSymbols(Array.isArray(list) ? list : []);
      } catch {}
    })();
    return () => { cancel = true; };
  }, []);

  // ---- 4.3 SELECTORS/DERIVATES ----
  const byTab = useMemo(() => positions.filter(p => (activeTab === 'open' ? p.status === 'open' : p.status === 'closed')), [positions, activeTab]);

  const afterBasicFilters = useMemo(() => {
    return byTab.filter(p => {
      if (filters.side && filters.side !== 'all' && p.side !== filters.side) return false;
      if (filters.symbols && filters.symbols.length > 0 && !filters.symbols.includes(p.symbol)) return false;
      return true;
    });
  }, [byTab, filters]);

  const filtered = useMemo(() => {
    let list = afterBasicFilters;
    if (activeTab === 'closed') {
      const fromDT = combineDateTime(closedDateFrom, closedTimeFrom);
      const toDT = combineDateTime(closedDateTo, closedTimeTo);
      list = list.filter(p => {
        const closedAt = toDateOrNull(p.closed_at);
        if (!closedAt) return false;
        if (fromDT && closedAt < fromDT) return false;
        if (toDT && closedAt > toDT) return false;
        return true;
      });
    }
    return list;
  }, [afterBasicFilters, activeTab, closedDateFrom, closedTimeFrom, closedDateTo, closedTimeTo]);

  const openTrades = useMemo(() => filtered.filter(t => t.status === 'open'), [filtered]);
  const closedTrades = useMemo(() => filtered.filter(t => t.status === 'closed'), [filtered]);

  // ---- 4.4 HANDLER ----
  const handleCardClick = (t: PositionListItem) => { setSelected({ id: t.id, symbol: t.symbol }); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setSelected(null); };

  // ---- 4.5 RENDER ----
  return (
    <div className="space-y-4">
      {/* Header: Tabs links, Filter-Toggle rechts */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="open">Offen</TabsTrigger>
            <TabsTrigger value="closed">Geschlossen</TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          type="button"
          onClick={() => setShowFilters(s => !s)}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span aria-hidden>🔎</span>
          <span>Filter</span>
        </button>
      </div>

      {/* Filter-Panel (toggelbar) */}
      {showFilters && (
        <div className="space-y-3 p-3 rounded-md border border-zinc-200 dark:border-zinc-800">
          <TradesFiltersBar
            value={filters}
            onChange={setFilters}
            availableBots={bots}
            availableSymbols={symbols}
          />

          {activeTab === 'closed' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Geschlossen von (Datum/Zeit)</div>
                <div className="flex gap-2">
                  <input type="date" value={closedDateFrom} onChange={(e) => setClosedDateFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm" />
                  <input type="time" value={closedTimeFrom} onChange={(e) => setClosedTimeFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Geschlossen bis (Datum/Zeit)</div>
                <div className="flex gap-2">
                  <input type="date" value={closedDateTo} onChange={(e) => setClosedDateTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm" />
                  <input type="time" value={closedTimeTo} onChange={(e) => setClosedTimeTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm" />
                </div>
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <button type="button" className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm" onClick={() => { setClosedDateFrom(''); setClosedTimeFrom(''); setClosedDateTo(''); setClosedTimeTo(''); }}>Reset Filter</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Liste: Offene oder Geschlossene */}
      {activeTab === 'open' ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">{loading ? 'Lade…' : `${openTrades.length} Einträge`}</div>
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
          <div className="grid gap-3">
            {openTrades.length === 0 && !loading && (<div className="text-sm text-muted-foreground">Keine offenen Trades.</div>)}
            {openTrades.map((t) => (
              <div key={t.id} className="space-y-2">
                <TradeCardCompact
                  symbol={t.symbol}
                  side={t.side as 'long' | 'short'}
                  pnl={safeNumber(t.pnl, 0)}
                  botName={t.bot_name ?? undefined}
                  deltaPct={undefined}
                  onClick={() => handleCardClick(t)}
                />
                <MiniRange
                  labelEntry={t.side === 'short' ? 'SELL' : 'BUY'}
                  entry={t.entry_price ?? null}
                  sl={t.sl ?? null}
                  tp={t.tp ?? null}
                  mark={null}
                />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">{loading ? 'Lade…' : `${closedTrades.length} Einträge`}</div>
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
          <div className="grid gap-3">
            {closedTrades.length === 0 && !loading && (<div className="text-sm text-muted-foreground">Keine geschlossenen Trades.</div>)}
            {closedTrades.map((t) => (
              <div key={t.id} className="space-y-2">
                <TradeCardCompact
                  symbol={t.symbol}
                  side={t.side as 'long' | 'short'}
                  pnl={safeNumber(t.pnl, 0)}
                  botName={t.bot_name ?? undefined}
                  deltaPct={undefined}
                  onClick={() => handleCardClick(t)}
                />
                <MiniRange
                  labelEntry={t.side === 'short' ? 'SELL' : 'BUY'}
                  entry={t.entry_price ?? null}
                  sl={t.sl ?? null}
                  tp={t.tp ?? null}
                  mark={t.exit_price ?? null}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Responsive Modal/Panel: gleiche BG wie Panel-Inhalt */}
      <ResponsivePanel open={panelOpen} onClose={closePanel}>
        {selected ? (
          <div className="bg-white dark:bg-zinc-900">
            <TradeDetailPanel positionId={selected.id} />
          </div>
        ) : null}
      </ResponsivePanel>
    </div>
  );
}
