// ==============================
// 1) IMPORTS
// ==============================
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation, useNavigationType } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api, { type PositionListItem, type Bot } from "@/lib/api";
import { getAllSymbols, type SymbolInfo } from "@/lib/symbols";
import TradesFiltersBar, { type TradesFilters } from "@/components/app/TradesFiltersBar";
import TradeCardCompact from "@/components/app/TradeCardCompact";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MiniRange from "@/components/app/MiniRange";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SlidersHorizontal } from "lucide-react";

// ==============================
// 2) LOCAL TYPES
// ==============================
type TabKey = "open" | "closed";

// ==============================
// 3) HELPERS (klein & testbar)
// ==============================
function safeNumber(n: number | null | undefined, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function combineDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr && !timeStr) return null;
  const [yy, mm, dd] = (dateStr ?? "").split("-");
  const [HH, MM] = (timeStr ?? "").split(":");
  const y = Number(yy),
    m = Number(mm),
    d = Number(dd),
    h = Number(HH),
    min = Number(MM);
  const hasDate = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d);
  const hasTime = Number.isFinite(h) && Number.isFinite(min);
  if (!hasDate && !hasTime) return null;
  const now = new Date();
  const year = hasDate ? y : now.getFullYear();
  const month = hasDate ? m - 1 : now.getMonth();
  const day = hasDate ? d : now.getDate();
  const hour = hasTime ? h : 0;
  const minute = hasTime ? min : 0;
  const dt = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateHeader(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const compareDate = new Date(d);
  compareDate.setHours(0, 0, 0, 0);

  const formatted = d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

  if (compareDate.getTime() === today.getTime()) {
    return `Heute, ${formatted}`;
  } else if (compareDate.getTime() === yesterday.getTime()) {
    return `Gestern, ${formatted}`;
  }
  return formatted;
}

function groupTradesByDate(
  trades: PositionListItem[],
  dateField: "opened_at" | "closed_at",
): Map<string, PositionListItem[]> {
  const groups = new Map<string, PositionListItem[]>();
  for (const trade of trades) {
    const dateStr = trade[dateField];
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const key = date.toISOString().split("T")[0]; // YYYY-MM-DD
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
  const location = useLocation();
  const navigationType = useNavigationType(); // <--- NEU
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load symbols for icons
  const { data: symbolsInfo = [] } = useQuery<SymbolInfo[]>({
    queryKey: ['allSymbolsInfo'],
    queryFn: () => getAllSymbols(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Helper to get icon for a symbol
  const getIconForSymbol = useCallback((symbol: string): string | undefined => {
    const info = symbolsInfo.find(s => s.symbol === symbol);
    return info?.icon || undefined;
  }, [symbolsInfo]);

  // ---- 4.1 STATE (UI & Daten) ----
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const tab = searchParams.get("tab");
    return tab === "open" || tab === "closed" ? tab : "open";
  });
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: "all",
    dateFrom: undefined,
    dateTo: undefined,
    timeFrom: undefined,
    timeTo: undefined,
    timeMode: "opened",
  });

  const [positions, setPositions] = useState<PositionListItem[]>([]);
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [displayLimit, setDisplayLimit] = useState<number>(() => {
    // Nur beim History-Back (POP) Restore nutzen
    if (navigationType !== "POP") {
      // Alte Restore-Werte verwerfen, wenn man von einer anderen Seite kommt
      sessionStorage.removeItem("trades-scroll-position");
      sessionStorage.removeItem("trades-display-limit");
      sessionStorage.removeItem("trades-tab");
      return 50;
    }

    const saved = sessionStorage.getItem("trades-display-limit");
    if (!saved) return 50;
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  // ---- 4.2 EFFECTS: Daten laden ----
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setIsLoadingMore(true);

        // Build query parameters from filters
        const params: any = {
          limit: displayLimit,
          status: activeTab === "open" ? "open" : "closed",
        };

        // Add filters as query parameters
        if (filters.botIds && filters.botIds.length > 0) {
          params.bot_id = filters.botIds.join(",");
        }
        if (filters.symbols && filters.symbols.length > 0) {
          params.symbols = filters.symbols.join(",");
        }
        if (filters.side && filters.side !== "all") {
          params.side = filters.side;
        }
        if (filters.dateFrom) {
          const year = filters.dateFrom.getFullYear();
          const month = String(filters.dateFrom.getMonth() + 1).padStart(2, '0');
          const day = String(filters.dateFrom.getDate()).padStart(2, '0');
          params.date_from = `${year}-${month}-${day}`;
        }
        if (filters.dateTo) {
          const year = filters.dateTo.getFullYear();
          const month = String(filters.dateTo.getMonth() + 1).padStart(2, '0');
          const day = String(filters.dateTo.getDate()).padStart(2, '0');
          params.date_to = `${year}-${month}-${day}`;
        }
        if (filters.timeFrom) {
          params.time_from = filters.timeFrom;
        }
        if (filters.timeTo) {
          params.time_to = filters.timeTo;
        }

        const res = await api.getPositions(params);

        if (!cancel) {
          setPositions(Array.isArray(res?.items) ? res.items : []);
          setTotalCount(res?.total ?? 0);
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? "Unbekannter Fehler");
      } finally {
        if (!cancel) {
          setLoading(false);
          setIsLoadingMore(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [displayLimit, activeTab, filters]);

  // Poll open positions every 10 seconds for live updates
  useEffect(() => {
    if (activeTab !== "open") return;

    const interval = setInterval(async () => {
      try {
        // Build query parameters from filters
        const params: any = {
          limit: displayLimit,
          status: "open",
        };

        if (filters.botIds && filters.botIds.length > 0) {
          params.bot_id = filters.botIds.join(",");
        }
        if (filters.symbols && filters.symbols.length > 0) {
          params.symbols = filters.symbols.join(",");
        }
        if (filters.side && filters.side !== "all") {
          params.side = filters.side;
        }
        if (filters.dateFrom) {
          const year = filters.dateFrom.getFullYear();
          const month = String(filters.dateFrom.getMonth() + 1).padStart(2, '0');
          const day = String(filters.dateFrom.getDate()).padStart(2, '0');
          params.date_from = `${year}-${month}-${day}`;
        }
        if (filters.dateTo) {
          const year = filters.dateTo.getFullYear();
          const month = String(filters.dateTo.getMonth() + 1).padStart(2, '0');
          const day = String(filters.dateTo.getDate()).padStart(2, '0');
          params.date_to = `${year}-${month}-${day}`;
        }
        if (filters.timeFrom) {
          params.time_from = filters.timeFrom;
        }
        if (filters.timeTo) {
          params.time_to = filters.timeTo;
        }

        const res = await api.getPositions(params);
        setPositions(Array.isArray(res?.items) ? res.items : []);
        setTotalCount(res?.total ?? 0);
      } catch (e) {
        console.error("Failed to poll positions:", e);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab, displayLimit, filters]);

  // Restore scroll position and displayLimit on mount
  useEffect(() => {
    if (navigationType !== "POP") return;

    const savedScrollY = sessionStorage.getItem("trades-scroll-position");
    const savedTab = sessionStorage.getItem("trades-tab");

    if (savedTab && (savedTab === "open" || savedTab === "closed")) {
      setActiveTab(savedTab as TabKey);
    }

    if (savedScrollY) {
      setTimeout(() => {
        const y = parseInt(savedScrollY, 10);
        const container = scrollContainerRef.current;

        if (container) {
          container.scrollTo({ top: y, behavior: "auto" });
        } else {
          window.scrollTo(0, y);
        }

        sessionStorage.removeItem("trades-scroll-position");
      }, 100);
    }
  }, [navigationType]);

  // Reset displayLimit when leaving trades pages
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentPath = location.pathname;
      if (!currentPath.startsWith("/trades") && !currentPath.startsWith("/trade/")) {
        sessionStorage.removeItem("trades-display-limit");
        sessionStorage.removeItem("trades-tab");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [location.pathname]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await api.getBots();
        if (!cancel) setBots((list as Bot[]).map((b) => ({ id: b.id, name: b.name })));
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await api.getSymbols();
        if (!cancel) setSymbols(Array.isArray(list) ? list : []);
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // ---- 4.3 SELECTORS/DERIVATES ----
  // Positions are now filtered server-side, so we just use them directly
  const filtered = useMemo(() => positions, [positions]);

  const openTrades = useMemo(() => {
    const trades = filtered.filter((t) => t.status === "open");
    
    // Sortiere nach opened_at (neueste zuerst)
    return trades.sort((a, b) => {
      const dateA = a.opened_at ? new Date(a.opened_at).getTime() : 0;
      const dateB = b.opened_at ? new Date(b.opened_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [filtered]);

  const closedTrades = useMemo(() => {
    const trades = filtered.filter((t) => t.status === "closed");
    // Sortiere nach closed_at (neueste zuerst)
    return trades.sort((a, b) => {
      const dateA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const dateB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [filtered]);

  const hasMoreToLoad = positions.length < totalCount;

  // Save scroll position and displayLimit before navigating
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    const scrollY = container ? container.scrollTop : window.scrollY;

    sessionStorage.setItem("trades-scroll-position", String(scrollY));
    sessionStorage.setItem("trades-tab", activeTab);
    sessionStorage.setItem("trades-display-limit", String(displayLimit));
  }, [activeTab, displayLimit]);

  // ---- 4.4 HANDLER ----
  const handleCardClick = (t: PositionListItem) => {
    saveScrollPosition();
    navigate(`/trade/${t.id}`);
  };

  const handleTabChange = (newTab: TabKey) => {
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
    sessionStorage.setItem("trades-tab", newTab);
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMoreToLoad) {
      setDisplayLimit((prev) => prev + 50);
    }
  };

  // Gruppiere Trades nach Datum
  const openTradesGrouped = useMemo(() => groupTradesByDate(openTrades, "opened_at"), [openTrades]);
  const closedTradesGrouped = useMemo(() => groupTradesByDate(closedTrades, "closed_at"), [closedTrades]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side && filters.side !== "all") count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    return count;
  }, [filters]);

  const FilterButton = (
    <Button variant="ghost" size="icon" onClick={() => setShowFilters(!showFilters)} className="relative">
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  // Desktop Filter Button for header
  const DesktopFilterButton = (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setShowFilters(!showFilters)}
      className="relative"
    >
      <SlidersHorizontal className="h-4 w-4" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  // ---- 4.5 RENDER ----
  return (
    <DashboardLayout
      pageTitle="Trades"
      mobileHeaderRight={FilterButton}
      desktopHeaderRight={DesktopFilterButton}
    >
      {/* Filter-Modal - Mobile */}
      {showFilters && (
        <div className="fixed inset-0 bg-background/80 z-50 lg:hidden" onClick={() => setShowFilters(false)}>
          <div
            className="fixed inset-x-0 top-14 bottom-16 bg-background flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <TradesFiltersBar
              value={filters}
              onChange={setFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={true}
              showTimeRange={true}
              showSignalKind={false}
            />
          </div>
        </div>
      )}

      {/* Tabs integrated into header area - sticky */}
      <div className="sticky top-14 lg:top-28 z-10 bg-background border-b">
        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-2 h-10 rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="open"
              className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              Offen
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              Geschlossen
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-auto flex-1" ref={scrollContainerRef}>
        <div className="space-y-4 p-4 pb-24">
          {/* Filter - Desktop (collapsible) */}
          {showFilters && (
            <div className="hidden lg:block border rounded-lg bg-muted/30">
              <TradesFiltersBar
                value={filters}
                onChange={setFilters}
                availableBots={bots}
                availableSymbols={symbols}
                showDateRange={true}
                showTimeRange={true}
                showSignalKind={false}
              />
            </div>
          )}

          {/* Liste: Offene oder Geschlossene */}
          {activeTab === "open" ? (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">
                  {loading ? "Lade…" : `${openTrades.length} von ${totalCount} Einträgen`}
                </div>
                {error && <div className="text-sm text-red-500">{error}</div>}
              </div>
              <div className="space-y-4">
                {openTrades.length === 0 && !loading && (
                  <div className="text-sm text-muted-foreground py-4">Keine offenen Trades.</div>
                )}
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
                              baseIconUrl={getIconForSymbol(t.symbol)}
                              side={t.side as "long" | "short"}
                              pnl={safeNumber(t.unrealized_pnl ?? t.pnl, 0)}
                              botName={t.bot_name ?? undefined}
                              deltaPct={t.pnl_pct ?? undefined}
                              onClick={() => {}}
                              variant="plain"
                            />
                            <MiniRange
                              labelEntry={t.side === "short" ? "Sell" : "Buy"}
                              entry={t.entry_price_vwap ?? t.entry_price ?? null}
                              sl={t.sl ?? null}
                              tp={t.tp ?? null}
                              mark={t.mark_price ?? null}
                              side={t.side as "long" | "short"}
                              entryBest={t.entry_price_best}
                              exitBest={t.exit_price_best}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              {hasMoreToLoad && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>
                    {isLoadingMore ? "Lädt..." : "Weitere 50 Trades laden"}
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">
                  {loading ? "Lade…" : `${closedTrades.length} von ${totalCount} Einträgen`}
                </div>
                {error && <div className="text-sm text-red-500">{error}</div>}
              </div>
              <div className="space-y-4">
                {closedTrades.length === 0 && !loading && (
                  <div className="text-sm text-muted-foreground py-4">Keine geschlossenen Trades.</div>
                )}
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
                              baseIconUrl={getIconForSymbol(t.symbol)}
                              side={t.side as "long" | "short"}
                              pnl={safeNumber(t.pnl, 0)}
                              botName={t.bot_name ?? undefined}
                              deltaPct={t.pnl_pct ?? undefined}
                              onClick={() => {}}
                              variant="plain"
                            />
                            <MiniRange
                              labelEntry={t.side === "short" ? "Sell" : "Buy"}
                              entry={t.entry_price_vwap ?? t.entry_price ?? null}
                              sl={t.sl ?? null}
                              tp={t.tp ?? null}
                              mark={t.exit_price ?? null}
                              side={t.side as "long" | "short"}
                              entryBest={t.entry_price_best}
                              exitBest={t.exit_price_best}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              {hasMoreToLoad && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>
                    {isLoadingMore ? "Lädt..." : "Weitere 50 Trades laden"}
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
