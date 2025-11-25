// src/components/app/TradeDetailPanel.tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import MiniRange from '@/components/app/MiniRange';
import { formatPrice, formatCurrency, formatMs } from '@/lib/formatters';

type Props = { positionId: number };

export default function TradeDetailPanel({ positionId }: Props) {
  const pid = positionId;
  const qc = useQueryClient();

  const { data: position, isLoading: posLoading } = useQuery({
    queryKey: ['position', pid],
    queryFn: () => api.getPosition(pid),
    enabled: Number.isFinite(pid),
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', pid],
    queryFn: () => api.getOrders(pid),
    enabled: Number.isFinite(pid),
  });

  const { data: funding } = useQuery({
    queryKey: ['funding', pid],
    queryFn: () => api.getFunding(pid),
    enabled: Number.isFinite(pid),
  });

  const isOpen = position?.status === 'open';

  // --- Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [action, setAction] = useState<'close' | 'sltp'>('sltp');
  const [sl, setSl] = useState<string>('');
  const [tp, setTp] = useState<string>('');

  // Collapsible states
  const [positionOpen, setPositionOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);

  // --- Mutations
  const closeMutation = useMutation({
    mutationFn: async () => {
      await api.logAction('UI_CLICK_CLOSE', { position_id: pid });
      return api.closePosition(pid);
    },
    onSuccess: async (res) => {
      await api.logAction('API_SENT_CLOSE', { position_id: pid, response: res });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['position', pid] }),
        qc.invalidateQueries({ queryKey: ['positions'] }),
        qc.invalidateQueries({ queryKey: ['orders', pid] }),
      ]);
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      await api.logAction('API_ERROR_CLOSE', { position_id: pid, error: String(err?.message ?? err) });
      alert(err?.message ?? 'Close fehlgeschlagen');
    },
  });

  const sltpMutation = useMutation({
    mutationFn: async () => {
      const payload: { sl?: number; tp?: number } = {};
      if (sl.trim() !== '') payload.sl = Number(sl);
      if (tp.trim() !== '') payload.tp = Number(tp);
      await api.logAction('UI_CLICK_SLTP', { position_id: pid, payload });
      return api.setPositionSlTp(pid, payload);
    },
    onSuccess: async (res) => {
      await api.logAction('API_SENT_SLTP', { position_id: pid, response: res });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['position', pid] }),
        qc.invalidateQueries({ queryKey: ['orders', pid] }),
        qc.invalidateQueries({ queryKey: ['positions'] }),
      ]);
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      await api.logAction('API_ERROR_SLTP', { position_id: pid, error: String(err?.message ?? err) });
      alert(err?.message ?? 'SL/TP Update fehlgeschlagen');
    },
  });

  const submit = () => {
    if (action === 'close') {
      closeMutation.mutate();
    } else {
      if (sl.trim() !== '' && Number.isNaN(Number(sl))) return alert('SL ist keine Zahl');
      if (tp.trim() !== '' && Number.isNaN(Number(tp))) return alert('TP ist keine Zahl');
      sltpMutation.mutate();
    }
  };

  const isLong = position?.side === 'long';

  return (
    <div className="relative pb-24">
      <div className="space-y-3">
        {/* Header Card */}
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Position #{pid}</CardTitle>
            {position?.status && (
              <Badge variant={isOpen ? 'default' : 'secondary'} className="uppercase text-xs">
                {position.status}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!posLoading && position && (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-0.5">Symbol</div>
                    <div className="font-semibold flex items-center gap-1.5">
                      {position.symbol}
                      <Badge 
                        variant={isLong ? "default" : "destructive"}
                        className={`${isLong ? 'bg-long-bg hover:bg-long-bg/80 text-long' : 'bg-short-bg hover:bg-short-bg/80 text-short'} text-[10px] px-1.5 py-0 h-4`}
                      >
                        {position.side === 'long' ? 'Long' : 'Short'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Leverage</div>
                    <div className="font-semibold">{position.leverage_size || '—'}x</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Entry Preis</div>
                    <div className="font-semibold">{formatPrice(position.entry_price)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Trigger Preis</div>
                    <div className="font-semibold">{formatPrice(position.trigger_price)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-0.5">QTY (Base)</div>
                    <div className="font-semibold">{formatPrice(position.qty ?? position.tv_qty)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Positionsgröße</div>
                    <div className="font-semibold">{formatPrice(position.position_size_usdt)} USDT</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Trade ID</div>
                    <div className="font-mono text-[10px]">{position.trade_id || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Leverage Type</div>
                    <div className="font-semibold">{position.leverage_type || '—'}</div>
                  </div>
                </div>

                <div className="pt-1">
                  <MiniRange
                    labelEntry={position.side === 'short' ? 'SELL' : 'BUY'}
                    entry={position.entry_price ?? null}
                    sl={position.sl ?? null}
                    tp={position.tp ?? null}
                    mark={position.mark_price ?? position.exit_price ?? null}
                    side={position.side as "long" | "short"}
                    entryBest={position.entry_price_best}
                    exitBest={position.exit_price_best}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Transaktionskosten */}
        {position && (
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Transaktionskosten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">Fees Total</div>
                  <div className="font-semibold">
                    {formatCurrency((position.fee_open_usdt || 0) + (position.fee_close_usdt || 0))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Open: {formatCurrency(position.fee_open_usdt)} / Close: {formatCurrency(position.fee_close_usdt)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Slippage Liquidität</div>
                  <div className="font-semibold">
                    {formatCurrency((position.slippage_liquidity_open || 0) + (position.slippage_liquidity_close || 0))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Open: {formatCurrency(position.slippage_liquidity_open)} / Close: {formatCurrency(position.slippage_liquidity_close)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Slippage Timelag</div>
                  <div className="font-semibold">{formatCurrency(position.slippage_timelag)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timelag Open */}
        {position && (
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Timelag Open</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">TV → Bot</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_tv_to_bot)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Bot Processing</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_bot_processing)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Bot → Exchange</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_bot_to_exchange)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timelag Close */}
        {position && position.status === 'closed' && (
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Timelag Close</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">TV → Bot</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_close_tv_to_bot)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Bot Processing</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_close_bot_processing)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Bot → Exchange</div>
                  <div className="font-semibold font-mono">{formatMs(position.timelag_close_bot_to_exchange)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Collapsible JSON Sections */}
        <Card className="shadow-sm">
          <Collapsible open={positionOpen} onOpenChange={setPositionOpen}>
            <CardHeader className="cursor-pointer pb-2" onClick={() => setPositionOpen(!positionOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Position (Raw JSON)</CardTitle>
                {positionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <pre className="text-[10px] overflow-auto bg-muted/40 rounded p-2 max-h-48">
                  {JSON.stringify(position, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card className="shadow-sm">
          <Collapsible open={ordersOpen} onOpenChange={setOrdersOpen}>
            <CardHeader className="cursor-pointer pb-2" onClick={() => setOrdersOpen(!ordersOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Orders (Raw JSON)</CardTitle>
                {ordersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <pre className="text-[10px] overflow-auto bg-muted/40 rounded p-2 max-h-48">
                  {JSON.stringify(orders, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card className="shadow-sm">
          <Collapsible open={fundingOpen} onOpenChange={setFundingOpen}>
            <CardHeader className="cursor-pointer pb-2" onClick={() => setFundingOpen(!fundingOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Funding (Raw JSON)</CardTitle>
                {fundingOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <pre className="text-[10px] overflow-auto bg-muted/40 rounded p-2 max-h-48">
                  {JSON.stringify(funding, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Sticky Action Bar */}
      {isOpen && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 bg-card/95 backdrop-blur-sm border-t border-border p-3 z-[100] shadow-lg">
          <div className="max-w-lg mx-auto">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" size="default">
                  Aktion (Close / SL / TP)
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Aktion ausführen</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2">
                  <Button
                    variant={action === 'sltp' ? 'default' : 'outline'}
                    onClick={() => setAction('sltp')}
                    className="flex-1"
                  >
                    SL / TP setzen
                  </Button>
                  <Button
                    variant={action === 'close' ? 'default' : 'outline'}
                    onClick={() => setAction('close')}
                    className="flex-1"
                  >
                    Position schließen
                  </Button>
                </div>

                {action === 'sltp' && (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="sl" className="text-sm">SL-Trigger-Preis (optional)</Label>
                      <Input
                        id="sl"
                        placeholder="z.B. 2.45"
                        inputMode="decimal"
                        value={sl}
                        onChange={(e) => setSl(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="tp" className="text-sm">TP-Preis (optional)</Label>
                      <Input
                        id="tp"
                        placeholder="z.B. 2.48"
                        inputMode="decimal"
                        value={tp}
                        onChange={(e) => setTp(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    onClick={submit}
                    disabled={
                      (action === 'close' && closeMutation.isPending) ||
                      (action === 'sltp' && sltpMutation.isPending)
                    }
                  >
                    {action === 'close'
                      ? closeMutation.isPending
                        ? 'Schließe…'
                        : 'Schließen'
                      : sltpMutation.isPending
                      ? 'Speichere…'
                      : 'Speichern'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}
    </div>
  );
}
