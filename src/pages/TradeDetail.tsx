import { actions } from '@/lib/api';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export default function TradeDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const qc = useQueryClient();

  const { data: position, isLoading: posLoading } = useQuery({
    queryKey: ['position', pid],
    queryFn: () => api.getPosition(pid),
    enabled: !isNaN(pid),
  });
  const { data: orders } = useQuery({
    queryKey: ['orders', pid],
    queryFn: () => api.getOrders(pid),
    enabled: !isNaN(pid),
  });
  const { data: funding } = useQuery({
    queryKey: ['funding', pid],
    queryFn: () => api.getFunding(pid),
    enabled: !isNaN(pid),
  });

  const isOpen = position?.status === 'open';

  // --- Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [action, setAction] = useState<'close' | 'sltp'>('sltp');
  const [sl, setSl] = useState<string>('');  // als string für leere Eingabe
  const [tp, setTp] = useState<string>('');

  // --- Mutations
  const closeMutation = useMutation({
    mutationFn: async () => {
      await api.logAction('UI_CLICK_CLOSE', { position_id: pid });  // Logging
      return api.closePosition(pid);
    },
    onSuccess: async (res) => {
      await api.logAction('API_SENT_CLOSE', { position_id: pid, response: res }); // Logging
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
      await api.logAction('UI_CLICK_SLTP', { position_id: pid, payload });  // Logging
      return api.setPositionSlTp(pid, payload);
    },
    onSuccess: async (res) => {
      await api.logAction('API_SENT_SLTP', { position_id: pid, response: res }); // Logging
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

  if (isNaN(pid)) return <div>Ungültige ID</div>;

  const submit = () => {
    if (action === 'close') {
      closeMutation.mutate();
    } else {
      // Validierung Nummern (optional streng)
      if (sl.trim() !== '' && Number.isNaN(Number(sl))) return alert('SL ist keine Zahl');
      if (tp.trim() !== '' && Number.isNaN(Number(tp))) return alert('TP ist keine Zahl');
      sltpMutation.mutate();
    }
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base sm:text-lg">Position #{pid}</CardTitle>
          {position?.status && (
            <Badge variant={isOpen ? 'default' : 'secondary'} className="uppercase">
              {position.status}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!posLoading && position && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs sm:text-sm">
              <div><span className="text-muted-foreground">Symbol:</span> <b>{position.symbol}</b></div>
              <div><span className="text-muted-foreground">Side:</span> <b className="uppercase">{position.side}</b></div>
              <div><span className="text-muted-foreground">Entry:</span> <b>$ {position.entry_price?.toFixed(2) ?? '—'}</b></div>
              <div><span className="text-muted-foreground">QTY:</span> <b>{position.qty ?? position.tv_qty ?? '—'}</b></div>
            </div>
          )}

          {/* Action Bar: nur bei offenen Trades */}
          <div className="flex flex-wrap gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!isOpen}>Aktion (Close / SL / TP)</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Aktion ausführen</DialogTitle>
                </DialogHeader>

                {/* Toggle Close vs SLTP */}
                <div className="flex gap-2">
                  <Button
                    variant={action === 'sltp' ? 'default' : 'outline'}
                    onClick={() => setAction('sltp')}
                  >
                    SL / TP setzen
                  </Button>
                  <Button
                    variant={action === 'close' ? 'default' : 'outline'}
                    onClick={() => setAction('close')}
                  >
                    Position schließen
                  </Button>
                </div>

                {/* Formfelder – nur bei SLTP */}
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
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                  <Button
                    onClick={submit}
                    disabled={
                      (action === 'close' && closeMutation.isPending) ||
                      (action === 'sltp' && sltpMutation.isPending)
                    }
                  >
                    {action === 'close'
                      ? (closeMutation.isPending ? 'Schließe…' : 'Schließen')
                      : (sltpMutation.isPending ? 'Speichere…' : 'Speichern')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Debug JSON */}
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Position (raw)</div>
            <pre className="text-xs overflow-auto bg-muted/40 rounded p-2">
              {JSON.stringify(position, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base sm:text-lg">Orders</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-[10px] sm:text-xs overflow-auto">{JSON.stringify(orders, null, 2)}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base sm:text-lg">Funding</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-[10px] sm:text-xs overflow-auto">{JSON.stringify(funding, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}


// --- Action Buttons (simple) ---
function SltpActions({ pid }: { pid: number }){
  const setBoth = async ()=>{
    const tp = parseFloat(prompt('TP Trigger (leer = kein Update)') || 'NaN');
    const sl = parseFloat(prompt('SL Trigger (leer = kein Update)') || 'NaN');
    const body: any = { tp: isNaN(tp) ? null : tp, sl: isNaN(sl) ? null : sl };
    await actions.setTpSl(pid, body);
    alert('TP/SL aktualisiert');
  };
  const closeNow = async ()=>{
    await actions.closePosition(pid);
    alert('Position geschlossen (Market)');
  };
  return (
    <div className="mt-4 flex gap-2">
      <button className="px-3 py-1 rounded border" onClick={setBoth}>TP/SL setzen</button>
      <button className="px-3 py-1 rounded border" onClick={closeNow}>Close (Market)</button>
    </div>
  );
}
