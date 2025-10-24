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
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';

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
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: 'all',
    dateFrom: undefined,
    dateTo: undefined,
    timeFrom: undefined,
    timeTo: undefined,
    timeMode: 'opened',
  });

  const [positions, setPositions] = useState<PositionListItem[]>([]);
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


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

    // Datumsfilter
    if (filters.dateFrom || filters.dateTo) {
      list = list.filter((p) => {
        const date = toDateOrNull(activeTab === 'closed' ? p.closed_at : p.opened_at);
        if (!date) return false;
        if (filters.dateFrom && date < filters.dateFrom) return false;
        if (filters.dateTo && date > filters.dateTo) return false;
        return true;
      });
    }

    // Tageszeitfilter
    if (filters.timeFrom || filters.timeTo) {
      list = list.filter((p) => {
        const dateStr = filters.timeMode === 'closed' ? p.closed_at : p.opened_at;
        const date = toDateOrNull(dateStr);
        if (!date) return false;
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const timeInMinutes = hours * 60 + minutes;

        let fromMinutes = 0;
        let toMinutes = 24 * 60;

        if (filters.timeFrom) {
          const [h, m] = filters.timeFrom.split(':').map(Number);
          fromMinutes = h * 60 + m;
        }
        if (filters.timeTo) {
          const [h, m] = filters.timeTo.split(':').map(Number);
          toMinutes = h * 60 + m;
        }

        // Handle overnight ranges (e.g., 22:00 - 03:00)
        if (fromMinutes > toMinutes) {
          return timeInMinutes >= fromMinutes || timeInMinutes <= toMinutes;
        }
        return timeInMinutes >= fromMinutes && timeInMinutes <= toMinutes;
      });
    }

    return list;
  }, [afterBasicFilters, filters, activeTab]);

  const openTrades = useMemo(() => filtered.filter(t => t.status === 'open'), [filtered]);
  const closedTrades = useMemo(() => filtered.filter(t => t.status === 'closed'), [filtered]);

  // ---- 4.4 HANDLER ----
  const handleCardClick = (t: PositionListItem) => { setSelected({ id: t.id, symbol: t.symbol }); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setSelected(null); };

  const [showFilters, setShowFilters] = useState(false);

  const FilterButton = (
    <Button 
      variant="ghost" 
      size="icon"
      onClick={() => setShowFilters(!showFilters)}
      className="lg:hidden"
    >
      <SlidersHorizontal className="h-5 w-5" />
    </Button>
  );

  // ---- 4.5 RENDER ----
  return (
    <DashboardLayout pageTitle="Trades" mobileHeaderRight={FilterButton}>
      <div className="space-y-4 p-4 pb-24">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList className="h-9 px-2">
            <TabsTrigger value="open" className="px-4 text-sm">Offen</TabsTrigger>
            <TabsTrigger value="closed" className="px-4 text-sm">Geschlossen</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter - Desktop (always visible) */}
        <div className="hidden lg:block">
          <TradesFiltersBar
            value={filters}
            onChange={setFilters}
            availableBots={bots}
            availableSymbols={symbols}
            showDateRange={activeTab === 'closed'}
            showTimeRange={activeTab === 'closed'}
            showSignalKind={false}
          />
        </div>

        {/* Filter - Mobile (conditional) */}
        {showFilters && (
          <div className="lg:hidden">
            <TradesFiltersBar
              value={filters}
              onChange={setFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={activeTab === 'closed'}
              showTimeRange={activeTab === 'closed'}
              showSignalKind={false}
            />
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
              <Card
                key={t.id}
                onClick={() => handleCardClick(t)}
                className="cursor-pointer hover:bg-muted/50 transition-colors p-0 overflow-hidden"
              >
                <TradeCardCompact
                  symbol={t.symbol}
                  side={t.side as 'long' | 'short'}
                  pnl={safeNumber(t.pnl, 0)}
                  botName={t.bot_name ?? undefined}
                  deltaPct={undefined}
                  onClick={() => {}}
                />
                <MiniRange
                  labelEntry={t.side === 'short' ? 'SELL' : 'BUY'}
                  entry={t.entry_price ?? null}
                  sl={t.sl ?? null}
                  tp={t.tp ?? null}
                  mark={null}
                />
              </Card>
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
              <Card
                key={t.id}
                onClick={() => handleCardClick(t)}
                className="cursor-pointer hover:bg-muted/50 transition-colors p-0 overflow-hidden"
              >
                <TradeCardCompact
                  symbol={t.symbol}
                  side={t.side as 'long' | 'short'}
                  pnl={safeNumber(t.pnl, 0)}
                  botName={t.bot_name ?? undefined}
                  deltaPct={undefined}
                  onClick={() => {}}
                />
                <MiniRange
                  labelEntry={t.side === 'short' ? 'SELL' : 'BUY'}
                  entry={t.entry_price ?? null}
                  sl={t.sl ?? null}
                  tp={t.tp ?? null}
                  mark={t.exit_price ?? null}
                />
              </Card>
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
    </DashboardLayout>
  );
}
