// src/pages/Signals.tsx
import { useEffect, useMemo, useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<SignalTab>('tv');
  const [tvSignals, setTvSignals] = useState<any[]>([]);
  const [orderSignals, setOrderSignals] = useState<any[]>([]);
  const [manualSignals, setManualSignals] = useState<any[]>([]);
  
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
  }, [activeTab, filters]);

  const loadSignals = async () => {
    const params: any = {};
    
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
    if (signals.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Keine Signale gefunden.
        </div>
      );
    }

    return (
      <div className="divide-y divide-border">
        {signals.map((signal) => {
          return (
            <div
              key={signal.id}
              onClick={() => {
                const queryParam = type === 'tv' ? 'tv' : type === 'orders' ? 'orders' : 'manual';
                window.location.href = `/signals/${signal.id}?type=${queryParam}`;
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

      <div className="p-4 pb-24">
        {/* Filter - Desktop (collapsible) */}
        {showFilters && (
          <div className="hidden lg:block border rounded-lg bg-muted/30 mb-4">
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SignalTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="tv">TV Signals</TabsTrigger>
            <TabsTrigger value="orders">Bot Orders</TabsTrigger>
            <TabsTrigger value="manual">Manual Actions</TabsTrigger>
          </TabsList>

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
    </DashboardLayout>
  );
}
