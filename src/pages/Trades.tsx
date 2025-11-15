// ==============================
// 1) IMPORTS
// ==============================
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
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
// 3) HELPERS
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
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const compareDate = new Date(d);
  compareDate.setHours(0, 0, 0, 0);
  
  const formatted = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  
  if (compareDate.getTime() === today.getTime()) {
    return `Heute, ${formatted}`;
  } else if (compareDate.getTime() === yesterday.getTime()) {
    return `Gestern, ${formatted}`;
  }
  return formatted;
}

function groupTradesByDate(trades: PositionListItem[], dateField: 'opened_at' | 'closed_at'): Map<string, PositionListItem[]> {
  const groups = new Map<string, PositionListItem[]>();
  for (const trade of trades) {
    const dateStr = trade[dateField];
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const key = date.toISOString().split('T')[0];
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
  const [searchParams, setSearchParams] = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const tab = searchParams.get('tab');
    return (tab === 'open' || tab === 'closed') ? tab : 'open';
  });
  
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

  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // ---- Fetch Bots & Symbols ----
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

  // ---- Infinite Query ----
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['positions', activeTab],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await api.getPositions({
        status: activeTab === 'open' ? 'open' : 'closed',
        skip: pageParam,
        limit: 100,
      });
      return res;
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((acc, page) => acc + page.items.length, 0);
      if (totalFetched < lastPage.total) {
        return totalFetched;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  // ---- Dedupe & flatten all pages ----
  const allPositions = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<number>();
    const result: PositionListItem[] = [];
    for (const page of data.pages) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }
    return result;
  }, [data]);

  // ---- Filters ----
  const afterBasicFilters = useMemo(() => {
    return allPositions.filter(p => {
      if (filters.side && filters.side !== 'all' && p.side !== filters.side) return false;
      if (filters.botIds?.length && !filters.botIds.includes(p.bot_id ?? 0)) return false;
      if (filters.symbols?.length && !filters.symbols.includes(p.symbol ?? '')) return false;
      return true;
    });
  }, [allPositions, filters]);

  const afterDateFilters = useMemo(() => {
    const startDt = combineDateTime(filters.dateFrom?.toISOString().split('T')[0], filters.timeFrom);
    const endDt = combineDateTime(filters.dateTo?.toISOString().split('T')[0], filters.timeTo);
    if (!startDt && !endDt) return afterBasicFilters;
    const fieldKey = filters.timeMode === 'opened' ? 'opened_at' : 'closed_at';
    return afterBasicFilters.filter(p => {
      const val = p[fieldKey];
      if (!val) return false;
      const d = toDateOrNull(val);
      if (!d) return false;
      if (startDt && d < startDt) return false;
      if (endDt && d > endDt) return false;
      return true;
    });
  }, [afterBasicFilters, filters]);

  const sortedByTime = useMemo(() => {
    const arr = [...afterDateFilters];
    const fieldKey = activeTab === 'open' ? 'opened_at' : 'closed_at';
    arr.sort((a, b) => {
      const dateA = toDateOrNull(a[fieldKey])?.getTime() ?? 0;
      const dateB = toDateOrNull(b[fieldKey])?.getTime() ?? 0;
      return dateB - dateA;
    });
    return arr;
  }, [afterDateFilters, activeTab]);

  const groupedByDate = useMemo(() => {
    const fieldKey = activeTab === 'open' ? 'opened_at' : 'closed_at';
    return groupTradesByDate(sortedByTime, fieldKey);
  }, [sortedByTime, activeTab]);

  // ---- Scroll Position Restore ----
  useEffect(() => {
    const savedScrollY = sessionStorage.getItem('trades-scroll-position');
    const savedTab = sessionStorage.getItem('trades-tab');
    
    if (savedTab && (savedTab === 'open' || savedTab === 'closed')) {
      setActiveTab(savedTab as TabKey);
    }
    
    if (savedScrollY) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScrollY, 10));
        sessionStorage.removeItem('trades-scroll-position');
      }, 100);
    }
  }, []);

  // ---- IntersectionObserver for sentinel ----
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---- Handlers ----
  const saveScrollPosition = () => {
    sessionStorage.setItem('trades-scroll-position', String(window.scrollY));
    sessionStorage.setItem('trades-tab', activeTab);
  };

  const handleCardClick = (id: number) => {
    saveScrollPosition();
    navigate(`/trade/${id}`);
  };

  const handleTabChange = (value: string) => {
    const newTab = (value === 'open' || value === 'closed') ? value : 'open';
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.side && filters.side !== 'all') count++;
    if (filters.botIds?.length) count++;
    if (filters.symbols?.length) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    return count;
  }, [filters]);

  return (
    <DashboardLayout
      pageTitle="Trades"
      mobileHeaderRight={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      }
    >
      <div className="flex gap-6 h-full overflow-hidden">
        {/* Mobile Filters */}
        {showFilters && (
          <div className="fixed inset-0 z-50 bg-background md:hidden overflow-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Filter</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                  Schließen
                </Button>
              </div>
              <TradesFiltersBar
                value={filters}
                onChange={setFilters}
                availableBots={bots}
                availableSymbols={symbols}
              />
            </div>
          </div>
        )}

        {/* Desktop Filters */}
        <aside className="hidden md:block w-[260px] shrink-0">
          <TradesFiltersBar
            value={filters}
            onChange={setFilters}
            availableBots={bots}
            availableSymbols={symbols}
          />
        </aside>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="sticky top-0 z-10 bg-background border-b pb-3 mb-4">
              <TabsList className="w-full">
                <TabsTrigger value="open" className="flex-1">
                  Offen ({afterBasicFilters.filter(p => p.status === 'open').length})
                </TabsTrigger>
                <TabsTrigger value="closed" className="flex-1">
                  Geschlossen ({afterBasicFilters.filter(p => p.status === 'closed').length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="open" className="mt-0">
              {isLoading && <div className="text-muted-foreground p-4">Lädt...</div>}
              {error && <div className="text-destructive p-4">Fehler: {String(error)}</div>}
              {!isLoading && !error && groupedByDate.size === 0 && (
                <div className="text-muted-foreground p-4">Keine offenen Trades</div>
              )}
              {Array.from(groupedByDate.entries()).map(([dateKey, trades]) => (
                <div key={dateKey} className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {formatDateHeader(dateKey)}
                  </h3>
                  <div className="space-y-2">
                    {trades.map((trade) => (
                      <div key={trade.id}>
                        <TradeCardCompact
                          symbol={trade.symbol ?? ''}
                          botName={trade.bot_name ?? undefined}
                          side={trade.side as 'long' | 'short'}
                          pnl={safeNumber(trade.unrealized_pnl)}
                          deltaPct={safeNumber(trade.pnl_pct)}
                          onClick={() => handleCardClick(trade.id)}
                        />
                        <MiniRange
                          entry={safeNumber(trade.entry_price)}
                          mark={safeNumber(trade.mark_price)}
                          tp={safeNumber(trade.tp)}
                          sl={safeNumber(trade.sl)}
                          side={trade.side as 'long' | 'short'}
                        />
                      </div>
                    ))}
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
              <div ref={sentinelRef} className="h-10" />
              {isFetchingNextPage && (
                <div className="text-muted-foreground text-center py-4">Lädt mehr...</div>
              )}
            </TabsContent>

            <TabsContent value="closed" className="mt-0">
              {isLoading && <div className="text-muted-foreground p-4">Lädt...</div>}
              {error && <div className="text-destructive p-4">Fehler: {String(error)}</div>}
              {!isLoading && !error && groupedByDate.size === 0 && (
                <div className="text-muted-foreground p-4">Keine geschlossenen Trades</div>
              )}
              {Array.from(groupedByDate.entries()).map(([dateKey, trades]) => (
                <div key={dateKey} className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {formatDateHeader(dateKey)}
                  </h3>
                  <div className="space-y-2">
                    {trades.map((trade) => (
                      <div key={trade.id}>
                        <TradeCardCompact
                          symbol={trade.symbol ?? ''}
                          botName={trade.bot_name ?? undefined}
                          side={trade.side as 'long' | 'short'}
                          pnl={safeNumber(trade.pnl)}
                          deltaPct={safeNumber(trade.pnl_pct)}
                          onClick={() => handleCardClick(trade.id)}
                        />
                        <MiniRange
                          entry={safeNumber(trade.entry_price)}
                          mark={safeNumber(trade.exit_price)}
                          tp={safeNumber(trade.tp)}
                          sl={safeNumber(trade.sl)}
                          side={trade.side as 'long' | 'short'}
                        />
                      </div>
                    ))}
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
              <div ref={sentinelRef} className="h-10" />
              {isFetchingNextPage && (
                <div className="text-muted-foreground text-center py-4">Lädt mehr...</div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
