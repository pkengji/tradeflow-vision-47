// src/pages/Signals.tsx
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SlidersHorizontal } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';

type SignalTab = 'tv' | 'orders' | 'manual';
type MappedStatus = 'pending' | 'success' | 'failed';

function mapStatus(raw: string): MappedStatus {
  if (['received', 'pending', 'waiting_for_approval', 'pending_approval'].includes(raw)) return 'pending';
  if (['processed', 'sent', 'completed', 'ok'].includes(raw)) return 'success';
  return 'failed'; // error, rejected, failed
}

export default function Signals() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  const [activeTab, setActiveTab] = useState<SignalTab>(() => {
    if (navigationType !== "POP") {
      sessionStorage.removeItem("signals-scroll-position");
      sessionStorage.removeItem("signals-display-limit");
      sessionStorage.removeItem("signals-tab");
      return 'tv';
    }
    const saved = sessionStorage.getItem("signals-tab");
    return saved === 'tv' || saved === 'orders' || saved === 'manual' ? saved : 'tv';
  });
  
  const [tvSignals, setTvSignals] = useState<any[]>([]);
  const [orderSignals, setOrderSignals] = useState<any[]>([]);
  const [manualSignals, setManualSignals] = useState<any[]>([]);
  
  const [displayLimit, setDisplayLimit] = useState<number>(() => {
    if (navigationType !== "POP") return 50;
    const saved = sessionStorage.getItem("signals-display-limit");
    if (!saved) return 50;
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
  });
  
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: 'all',
    dateFrom: undefined,
    dateTo: undefined,
    timeFrom: undefined,
    timeTo: undefined,
    timeMode: 'opened',
    signalKind: 'all',
    signalStatus: 'all',
  });
  
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.signalStatus && filters.signalStatus !== 'all') count++;
    return count;
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const botsList = await api.getBots();
        setBots(botsList.map((b: any) => ({ id: b.id, name: b.name })));
      } catch {}
      try {
        const symbolsList = await api.getSymbols();
        setSymbols(symbolsList);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    loadSignals();
  }, [activeTab, filters, displayLimit]);

  // Restore scroll position on back navigation
  useEffect(() => {
    if (navigationType !== "POP") return;

    const savedScrollY = sessionStorage.getItem("signals-scroll-position");
    const savedTab = sessionStorage.getItem("signals-tab");

    if (savedTab && (savedTab === 'tv' || savedTab === 'orders' || savedTab === 'manual')) {
      setActiveTab(savedTab as SignalTab);
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

        sessionStorage.removeItem("signals-scroll-position");
      }, 100);
    }
  }, [navigationType]);

  const loadSignals = async () => {
    setIsLoadingMore(true);
    const params: any = {
      limit: displayLimit,
    };
    
    // Bot IDs
    if (filters.botIds.length > 0) {
      params.bot_id = filters.botIds[0]; // Backend expects single bot_id
    }
    
    // Symbols
    if (filters.symbols.length > 0) {
      params.symbol = filters.symbols.join(',');
    }
    
    // Date range
    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom);
      params.date_from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      params.date_to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    
    // Status mapping
    if (filters.signalStatus && filters.signalStatus !== 'all') {
      // For client-side filtering, we'll apply this after fetching
      // No need to send to backend as it expects raw status values
    }

    try {
      if (activeTab === 'tv') {
        const data = await api.getTvSignals(params);
        // Apply client-side status filtering
        let filtered = data;
        if (filters.signalStatus && filters.signalStatus !== 'all') {
          filtered = data.filter((item: any) => mapStatus(item.status) === filters.signalStatus);
        }
        setTvSignals(filtered);
      } else if (activeTab === 'orders') {
        const data = await api.getOutboxItems(params);
        // Apply client-side status filtering
        let filtered = data;
        if (filters.signalStatus && filters.signalStatus !== 'all') {
          filtered = data.filter((item: any) => mapStatus(item.status) === filters.signalStatus);
        }
        setOrderSignals(filtered);
      } else if (activeTab === 'manual') {
        const statusParam = params.status || undefined;
        const data = await api.getOutbox({ status: statusParam });
        // Client-side filtering for manual actions
        let filtered = data;
        
        // Filter by bot_id
        if (params.bot_id) {
          filtered = filtered.filter((item: any) => item.bot_id === params.bot_id);
        }
        
        // Filter by date range
        if (params.date_from || params.date_to) {
          filtered = filtered.filter((item: any) => {
            const itemDate = new Date(item.created_at).toISOString().split('T')[0];
            if (params.date_from && itemDate < params.date_from) return false;
            if (params.date_to && itemDate > params.date_to) return false;
            return true;
          });
        }
        
        // Filter by status
        if (filters.signalStatus && filters.signalStatus !== 'all') {
          filtered = filtered.filter((item: any) => mapStatus(item.status) === filters.signalStatus);
        }
        
        setManualSignals(filtered);
      }
    } catch (error) {
      console.error('Failed to load signals:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Save scroll position and displayLimit before navigating
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    const scrollY = container ? container.scrollTop : window.scrollY;

    sessionStorage.setItem("signals-scroll-position", String(scrollY));
    sessionStorage.setItem("signals-tab", activeTab);
    sessionStorage.setItem("signals-display-limit", String(displayLimit));
  }, [activeTab, displayLimit]);

  const handleLoadMore = () => {
    if (!isLoadingMore) {
      setDisplayLimit((prev) => prev + 50);
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const mapped = mapStatus(status);
    if (mapped === 'success') {
      return <Badge variant="default" className="text-xs bg-long-bg text-long">{status}</Badge>;
    }
    if (mapped === 'failed') {
      return <Badge variant="destructive" className="text-xs bg-short-bg text-short">{status}</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
  };

  const renderSignalList = (signals: any[], type: SignalTab) => {
    const displayedSignals = signals.slice(0, displayLimit);
    const hasMore = signals.length > displayLimit;

    if (signals.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Keine Signale gefunden.
        </div>
      );
    }

    return (
      <>
        <div className="divide-y divide-border">
          {displayedSignals.map((signal) => {
            return (
              <div
                key={signal.id}
                onClick={() => {
                  saveScrollPosition();
                  const queryParam = type === 'tv' ? 'tv' : type === 'orders' ? 'orders' : 'manual';
                  navigate(`/signals/${signal.id}?type=${queryParam}`);
                }}
                className="py-3 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {type === 'tv' && `TV Signal #${signal.id}`}
                        {type === 'orders' && `Order #${signal.id}`}
                        {type === 'manual' && `Manual #${signal.id}`}
                      </span>
                      {signal.symbol && (
                        <Badge variant="outline" className="text-xs">{signal.symbol}</Badge>
                      )}
                      {signal.side && (
                        <Badge 
                          variant={signal.side === 'long' ? 'default' : 'destructive'}
                          className={`text-xs ${signal.side === 'long' ? 'bg-long-bg text-long' : 'bg-short-bg text-short'}`}
                        >
                          {signal.side}
                        </Badge>
                      )}
                      {signal.kind && (
                        <Badge variant="outline" className="text-xs capitalize">{signal.kind}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(signal.created_at || signal.tv_ts)}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="text-right flex-shrink-0">
                    {getStatusBadge(signal.status)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {hasMore && (
          <div className="flex justify-center py-4">
            <Button 
              variant="outline" 
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Lädt...' : 'Mehr laden'}
            </Button>
          </div>
        )}
      </>
    );
  };

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

  const handleApplyFilters = () => {
    setShowFilters(false);
    loadSignals();
  };

  const handleResetFilters = () => {
    setFilters({
      botIds: [],
      symbols: [],
      side: 'all',
      dateFrom: undefined,
      dateTo: undefined,
      timeFrom: undefined,
      timeTo: undefined,
      timeMode: 'opened',
      signalKind: 'all',
      signalStatus: 'all',
    });
    setShowFilters(false);
  };

  return (
    <DashboardLayout
      pageTitle="Signale"
      mobileHeaderRight={FilterButton}
      desktopHeaderRight={FilterButton}
    >
      {/* Filter-Modal - Mobile */}
      {showFilters && (
        <div className="fixed inset-0 bg-background/80 z-50 lg:hidden" onClick={() => setShowFilters(false)}>
          <div className="fixed inset-x-0 top-14 bottom-16 bg-background flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-auto p-4">
              <TradesFiltersBar
                value={filters}
                onChange={setFilters}
                availableBots={bots}
                availableSymbols={symbols}
                showDateRange={true}
                showTimeRange={false}
                showSignalKind={false}
                showSignalStatus={true}
              />
            </div>
            <div className="border-t p-3 flex gap-3">
              <Button className="flex-1" onClick={handleApplyFilters}>Fertig</Button>
              <Button variant="outline" className="flex-1" onClick={handleResetFilters}>Zurücksetzen</Button>
            </div>
          </div>
        </div>
      )}

      {/* Filter - Desktop (collapsible) */}
      {showFilters && (
        <div className="hidden lg:block border rounded-lg bg-muted/30 m-4 mb-0">
          <div className="p-4">
            <TradesFiltersBar
              value={filters}
              onChange={setFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={true}
              showTimeRange={false}
              showSignalKind={false}
              showSignalStatus={true}
            />
          </div>
          <div className="border-t p-3 flex gap-3">
            <Button className="flex-1" onClick={handleApplyFilters}>Fertig</Button>
            <Button variant="outline" className="flex-1" onClick={handleResetFilters}>Zurücksetzen</Button>
          </div>
        </div>
      )}

      {/* Tabs - sticky */}
      <div className="sticky top-14 lg:top-28 z-10 bg-background border-b">
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v as SignalTab);
          sessionStorage.setItem("signals-tab", v);
          setDisplayLimit(50);
        }} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-10 rounded-none border-0 bg-transparent p-0">
            <TabsTrigger value="tv" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              TV Signals
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Bot Orders
            </TabsTrigger>
            <TabsTrigger value="manual" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Manual Actions
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-auto flex-1" ref={scrollContainerRef}>
        <div className="p-4 pb-24">
          <Tabs value={activeTab} className="w-full">
            <TabsContent value="tv">
              {renderSignalList(tvSignals, 'tv')}
            </TabsContent>

            <TabsContent value="orders">
              {renderSignalList(orderSignals, 'orders')}
            </TabsContent>

            <TabsContent value="manual">
              {renderSignalList(manualSignals, 'manual')}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
