// src/pages/Signals.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, SlidersHorizontal, Coins } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

// CSV-Export-Button (eigenständig, keine Lib nötig)
function ExportCSV({ url, filename }: { url: string; filename: string }) {
  const go = async () => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { alert('CSV-Export fehlgeschlagen'); return; }
    const txt = await res.text();
    const blob = new Blob([txt], { type: "text/csv" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Button variant="outline" onClick={go} size="sm">
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}

export default function Signals() {
  const navigate = useNavigate();
  const [outboxItems, setOutboxItems] = useState<any[]>([]);
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
  const [selectedSignal, setSelectedSignal] = useState<any>(null);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side && filters.side !== 'all') count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    if (filters.signalKind && filters.signalKind !== 'all') count++;
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
      try {
        const items = await api.getOutbox();
        setOutboxItems(items);
      } catch {}
    })();
  }, []);

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

  const handleSignalClick = (signal: any) => {
    if (signal.status === 'waiting_for_approval') {
      setSelectedSignal(signal);
    } else {
      navigate(`/signal/${signal.id}`);
    }
  };

  const handleApprove = async () => {
    if (!selectedSignal) return;
    try {
      await api.approveOutbox(selectedSignal.id);
      const items = await api.getOutbox();
      setOutboxItems(items);
      setSelectedSignal(null);
    } catch (error) {
      console.error('Failed to approve signal:', error);
    }
  };

  const handleCancel = async () => {
    if (!selectedSignal) return;
    try {
      await api.rejectOutbox(selectedSignal.id);
      const items = await api.getOutbox();
      setOutboxItems(items);
      setSelectedSignal(null);
    } catch (error) {
      console.error('Failed to reject signal:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'sent' || status === 'approved') return <Badge variant="default" className="text-xs bg-long-bg text-long">{status}</Badge>;
    if (status === 'failed') return <Badge variant="destructive" className="text-xs bg-short-bg text-short">failed</Badge>;
    if (status === 'rejected') return <Badge variant="secondary" className="text-xs">rejected</Badge>;
    if (status === 'queued') return <Badge variant="secondary" className="text-xs">queued</Badge>;
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
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
            <div className="overflow-auto">
              <TradesFiltersBar
                value={filters}
                onChange={setFilters}
                availableBots={bots}
                availableSymbols={symbols}
                showDateRange={true}
                showTimeRange={true}
                showSignalKind={true}
                showSignalStatus={true}
              />
            </div>
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>Fertig</Button>
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
                showTimeRange={true}
                showSignalKind={true}
                showSignalStatus={true}
              />
            </div>
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Liste */}
        <div className="divide-y divide-border">
          {outboxItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSignalClick(item)}
              className="cursor-pointer hover:bg-muted/30 transition-colors py-2"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                  <Coins className="h-5 w-5 text-primary" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">Outbox #{item.id}</span>
                    <Badge variant="outline" className="text-xs capitalize">{item.kind}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(item.created_at).toLocaleString('de-CH')}
                  </div>
                </div>

                {/* Right side */}
                <div className="text-right flex-shrink-0">
                  <div className="mt-0.5">
                    {getStatusBadge(item.status)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {outboxItems.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">Keine Signals gefunden.</div>
          )}
        </div>

        {/* Action buttons for queued signals */}
        {selectedSignal && selectedSignal.status === 'queued' && (
          <div className="fixed inset-x-0 bottom-16 bg-card border-t p-3 flex gap-3 z-50">
            <Button 
              className="flex-1" 
              onClick={handleApprove}
            >
              Approve
            </Button>
            <Button 
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
