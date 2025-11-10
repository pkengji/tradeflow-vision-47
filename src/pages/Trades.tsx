// ==============================
// 1) IMPORTS
// ==============================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type PositionListItem, type Bot } from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import TradeCardCompact from '@/components/app/TradeCardCompact';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import MiniRange from '@/components/app/MiniRange';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal } from 'lucide-react';

// ==============================
// 2) LOCAL TYPES
// ==============================
type TabKey = 'open' | 'closed';

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

function formatDateHeader(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupTradesByDate(trades: PositionListItem[], dateField: 'opened_at' | 'closed_at'): Map<string, PositionListItem[]> {
  const groups = new Map<string, PositionListItem[]>();
  for (const trade of trades) {
    const dateStr = trade[dateField];
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(trade);
  }
  return groups;
}

// ==============================
// 4) COMPONENT
// ==============================
export default function Trades() {
  const navigate = useNavigate();
  
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

  const [showFilters, setShowFilters] = useState(false);

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

  const openTrades = useMemo(() => {
    const trades = filtered.filter(t => t.status === 'open');
    // Sortiere nach opened_at (neueste zuerst)
    return trades.sort((a, b) => {
      const dateA = a.opened_at ? new Date(a.opened_at).getTime() : 0;
      const dateB = b.opened_at ? new Date(b.opened_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [filtered]);

  const closedTrades = useMemo(() => {
    const trades = filtered.filter(t => t.status === 'closed');
    // Sortiere nach closed_at (neueste zuerst)
    return trades.sort((a, b) => {
      const dateA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const dateB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [filtered]);

  // Gruppiere Trades nach Datum
  const openTradesGrouped = useMemo(() => groupTradesByDate(openTrades, 'opened_at'), [openTrades]);
  const closedTradesGrouped = useMemo(() => groupTradesByDate(closedTrades, 'closed_at'), [closedTrades]);

  // ---- 4.4 HANDLER ----
  const handleCardClick = (t: PositionListItem) => { 
    navigate(`/trade/${t.id}`);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side && filters.side !== 'all') count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    return count;
  }, [filters]);

  const FilterButton = (
    <Button 
      variant="ghost" 
      size="icon"
      onClick={() => setShowFilters(!showFilters)}
      className="relative"
    >
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  // ---- 4.5 RENDER ----
  return (
    <DashboardLayout pageTitle="Trades" mobileHeaderRight={FilterButton}>
      {/* Filter-Modal - Mobile */}
      {showFilters && (
        <div className="fixed inset-0 bg-background/80 z-50 lg:hidden" onClick={() => setShowFilters(false)}>
          <div className="fixed inset-x-0 top-14 bottom-16 bg-background flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-auto">
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
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs integrated into header area */}
      <div className="border-b">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-2 h-10 rounded-none border-0 bg-transparent p-0">
            <TabsTrigger value="open" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">Offen</TabsTrigger>
            <TabsTrigger value="closed" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">Geschlossen</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-4 p-4 pb-24">

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

      {/* Liste: Offene oder Geschlossene */}
      {activeTab === 'open' ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">{loading ? 'Lade…' : `${openTrades.length} Einträge`}</div>
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
          <div className="space-y-4">
            {openTrades.length === 0 && !loading && (<div className="text-sm text-muted-foreground py-4">Keine offenen Trades.</div>)}
            {Array.from(openTradesGrouped.entries())
              .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) // Neueste zuerst
              .map(([dateKey, trades], groupIndex) => (
                <div key={dateKey}>
                  {groupIndex > 0 && <Separator className="my-4" />}
                  <div className="text-xs text-muted-foreground font-medium mb-2 px-1">
                    {formatDateHeader(dateKey)}
                  </div>
                  <div className="divide-y divide-border">
                    {trades.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => handleCardClick(t)}
                        className="cursor-pointer hover:bg-muted/30 transition-colors py-2"
                      >
                        <TradeCardCompact
                          symbol={t.symbol}
                          side={t.side as 'long' | 'short'}
                          pnl={safeNumber(t.unrealized_pnl ?? t.pnl, 0)}
                          botName={t.bot_name ?? undefined}
                          deltaPct={t.pnl_pct ?? undefined}
                          onClick={() => {}}
                          variant="plain"
                        />
                        <MiniRange
                          labelEntry={t.side === 'short' ? 'Sell' : 'Buy'}
                          entry={t.entry_price_vwap ?? t.entry_price ?? null}
                          sl={t.sl ?? null}
                          tp={t.tp ?? null}
                          mark={t.mark_price ?? null}
                          side={t.side as 'long' | 'short'}
                        />
                      </div>
                    ))}
                  </div>
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
          <div className="space-y-4">
            {closedTrades.length === 0 && !loading && (<div className="text-sm text-muted-foreground py-4">Keine geschlossenen Trades.</div>)}
            {Array.from(closedTradesGrouped.entries())
              .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) // Neueste zuerst
              .map(([dateKey, trades], groupIndex) => (
                <div key={dateKey}>
                  {groupIndex > 0 && <Separator className="my-4" />}
                  <div className="text-xs text-muted-foreground font-medium mb-2 px-1">
                    {formatDateHeader(dateKey)}
                  </div>
                  <div className="divide-y divide-border">
                    {trades.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => handleCardClick(t)}
                        className="cursor-pointer hover:bg-muted/30 transition-colors py-2"
                      >
                        <TradeCardCompact
                          symbol={t.symbol}
                          side={t.side as 'long' | 'short'}
                          pnl={safeNumber(t.pnl, 0)}
                          botName={t.bot_name ?? undefined}
                          deltaPct={t.pnl_pct ?? undefined}
                          onClick={() => {}}
                          variant="plain"
                        />
                        <MiniRange
                          labelEntry={t.side === 'short' ? 'Sell' : 'Buy'}
                          entry={t.entry_price_vwap ?? t.entry_price ?? null}
                          sl={t.sl ?? null}
                          tp={t.tp ?? null}
                          mark={t.exit_price ?? null}
                          side={t.side as 'long' | 'short'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
      </div>
    </DashboardLayout>
  );
}
