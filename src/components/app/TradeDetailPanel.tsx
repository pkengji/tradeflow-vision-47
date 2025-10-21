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

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 6 });

  const fmtMs = (ms: number | null | undefined) =>
    ms == null ? '—' : `${ms}ms`;

  return (
    <div className="relative pb-20">
      <div className="space-y-4">
        {/* Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Position #{pid}</CardTitle>
            {position?.status && (
              <Badge variant={isOpen ? 'default' : 'secondary'} className="uppercase">
                {position.status}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!posLoading && position && (
              <>
                {/* Basis-Infos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Symbol</div>
                    <div className="font-semibold">{position.symbol}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Seite</div>
                    <div className="font-semibold uppercase">{position.side}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Entry Preis</div>
                    <div className="font-semibold">{fmt(position.entry_price)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Trigger Preis</div>
                    <div className="font-semibold">{fmt(position.trigger_price)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">QTY (Base)</div>
                    <div className="font-semibold">{fmt(position.qty ?? position.tv_qty)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Positionsgröße</div>
                    <div className="font-semibold">{fmt(position.position_size_usdt)} USDT</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Trade ID</div>
                    <div className="font-mono text-xs">{position.trade_id || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Leverage</div>
                    <div className="font-semibold">{position.leverage_size || '—'}x ({position.leverage_type || '—'})</div>
                  </div>
                </div>

                {/* Mini-Grafik */}
                <div className="pt-2">
                  <MiniRange
                    labelEntry={position.side === 'short' ? 'SELL' : 'BUY'}
                    entry={position.entry_price ?? null}
                    sl={position.sl ?? null}
                    tp={position.tp ?? null}
                    mark={position.mark_price ?? position.exit_price ?? null}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Transaktionskosten */}
        {position && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaktionskosten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Fees Total</div>
                  <div className="font-semibold">
                    {fmt((position.fee_open_usdt || 0) + (position.fee_close_usdt || 0))} USDT
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Open: {fmt(position.fee_open_usdt)} / Close: {fmt(position.fee_close_usdt)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Slippage Liquidität</div>
                  <div className="font-semibold">
                    {fmt((position.slippage_liquidity_open || 0) + (position.slippage_liquidity_close || 0))} USDT
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Open: {fmt(position.slippage_liquidity_open)} / Close: {fmt(position.slippage_liquidity_close)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Slippage Timelag</div>
                  <div className="font-semibold">{fmt(position.slippage_timelag)} USDT</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timelag Open */}
        {position && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timelag Open</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">TradingView → Bot</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_tv_to_bot)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Bot Processing</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_bot_processing)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Bot → Exchange</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_bot_to_exchange)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timelag Close */}
        {position && position.status === 'closed' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timelag Close</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">TradingView → Bot</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_close_tv_to_bot)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Bot Processing</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_close_bot_processing)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Bot → Exchange</div>
                  <div className="font-semibold font-mono">{fmtMs(position.timelag_close_bot_to_exchange)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Collapsible JSON Sections */}
        <Card>
          <Collapsible open={positionOpen} onOpenChange={setPositionOpen}>
            <CardHeader className="cursor-pointer" onClick={() => setPositionOpen(!positionOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Position (Raw JSON)</CardTitle>
                {positionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs overflow-auto bg-muted/40 rounded p-2 max-h-60">
                  {JSON.stringify(position, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card>
          <Collapsible open={ordersOpen} onOpenChange={setOrdersOpen}>
            <CardHeader className="cursor-pointer" onClick={() => setOrdersOpen(!ordersOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Orders (Raw JSON)</CardTitle>
                {ordersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs overflow-auto bg-muted/40 rounded p-2 max-h-60">
                  {JSON.stringify(orders, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card>
          <Collapsible open={fundingOpen} onOpenChange={setFundingOpen}>
            <CardHeader className="cursor-pointer" onClick={() => setFundingOpen(!fundingOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Funding (Raw JSON)</CardTitle>
                {fundingOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs overflow-auto bg-muted/40 rounded p-2 max-h-60">
                  {JSON.stringify(funding, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Sticky Action Bar (nur bei offenen Trades) */}
      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-50">
          <div className="max-w-lg mx-auto">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" size="lg">
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
                      <Label htmlFor="sl">SL-Trigger-Preis (optional)</Label>
                      <Input
                        id="sl"
                        placeholder="z.B. 2.4512"
                        inputMode="decimal"
                        value={sl}
                        onChange={(e) => setSl(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="tp">TP-Preis (optional)</Label>
                      <Input
                        id="tp"
                        placeholder="z.B. 2.4890"
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
