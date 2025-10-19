import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getTrades, type Trade, type TradesResponse } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';

// ========================= Mini-Range (Grafik) =========================
function MiniRange({
  sl, entry, tp, mark,
}: { sl?: number|null; entry?: number|null; tp?: number|null; mark?: number|null }) {
  if (sl == null || entry == null || tp == null) {
    return <div className="h-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">No SL/TP</div>;
  }
  const min = Math.min(sl, entry, tp);
  const max = Math.max(sl, entry, tp);
  const norm = (v: number) => ((v - min) / (max - min)) * 100;

  const xSL = norm(sl);
  const xEN = norm(entry);
  const xTP = norm(tp);
  const xMK = mark != null ? norm(mark) : null;

  return (
    <div className="relative h-10 rounded bg-muted px-2">
      <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-border" />
      <Tick x={xSL} label="SL" cls="bg-red-500" />
      <Tick x={xEN} label="BUY" cls="bg-primary" />
      <Tick x={xTP} label="TP" cls="bg-emerald-600" />
      {xMK != null && <Tick x={xMK} label="" cls="bg-zinc-800" hollow />}
      {xMK != null && (
        <div
          className="absolute top-1/2 h-1 -mt-0.5 bg-emerald-600/60 rounded-l"
          style={{ left: `${Math.min(xEN, xMK)}%`, width: `${Math.abs(xMK - xEN)}%` }}
        />
      )}
    </div>
  );
}
function Tick({ x, label, cls, hollow }: { x: number; label: string; cls: string; hollow?: boolean }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left: `${x}%` }}>
      <div className={`w-2 h-2 rounded-full ${hollow ? 'border border-zinc-800 bg-background' : cls}`} />
      {label && <div className="text-[10px] text-muted-foreground mt-1 text-center">{label}</div>}
    </div>
  );
}

// ========================= Open-Card =========================
function OpenTradeCard({ t, onDetails }: { t: Trade; onDetails: (t: Trade)=>void }) {
  const pnlColor = (t.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="rounded-xl border p-3 md:p-4 hover:shadow-sm transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">{t.symbol}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${t.side === 'long' || t.side === 'buy' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {t.side === 'long' || t.side === 'buy' ? 'Long' : 'Short'}
          </span>
        </div>
        <div className={`text-sm font-semibold ${pnlColor}`}>
          {t.pnl != null ? t.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} USDT
          {t.pnl_pct != null ? <span className="ml-1 text-xs">({t.pnl_pct.toFixed(2)}%)</span> : null}
        </div>
      </div>

      <div className="mt-3">
        <MiniRange sl={t.sl ?? null} entry={t.entry_price ?? null} tp={t.tp ?? null} mark={t.mark_price ?? null} />
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Field label="Entry" value={t.entry_price} />
        <Field label="Qty" value={t.qty} />
        <Field label="Mark" value={t.mark_price} />
        <Field label="Bot" value={t.bot_name ?? (t.bot_id ? `Bot #${t.bot_id}` : '—')} />
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onDetails(t)}>Details</Button>
      </div>
    </div>
  );
}

// ========================= Closed-Row =========================
function ClosedTradeRow({ t, onDetails }: { t: Trade; onDetails: (t: Trade)=>void }) {
  const pnlColor = (t.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 items-center py-3 border-b">
      <div className="font-medium">{t.symbol}</div>
      <div className="text-xs">{t.bot_name ?? (t.bot_id ? `Bot #${t.bot_id}` : '—')}</div>
      <div className="text-xs">{new Date(t.opened_at).toLocaleDateString()}</div>
      <div className="text-xs">{t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '—'}</div>
      <div className={`text-sm font-semibold ${pnlColor}`}>{t.pnl?.toFixed(2) ?? '—'} USDT</div>
      <div className="justify-self-end">
        <Button variant="outline" size="sm" onClick={() => onDetails(t)}>Details</Button>
      </div>
    </div>
  );
}

// ========================= Filter (Sheet) =========================
function TradesFilterSheet({
  trigger, symbol, setSymbol, side, setSide, botId, setBotId, symbols, bots, apply,
}: {
  trigger?: React.ReactNode;
  symbol: string; setSymbol: (v: string)=>void;
  side: string; setSide: (v: string)=>void;
  botId: string; setBotId: (v: string)=>void;
  symbols: string[]; bots: Array<{id:number; name:string}>;
  apply: ()=>void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger ?? <Button variant="outline">Filter</Button>}</SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>Filter</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <Input placeholder="Search symbol…" value={symbol} onChange={(e)=>setSymbol(e.target.value.toUpperCase())} />
          <Select value={side} onValueChange={(v)=>setSide(v === 'ALL' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Side" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sides</SelectItem>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
          <Select value={botId} onValueChange={(v)=>setBotId(v === 'ALL' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Bot" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Bots</SelectItem>
              {bots.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={apply}>Apply</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ========================= Details (Drawer) =========================
function TradeDetailsDrawer({ open, onOpenChange, trade }: { open: boolean; onOpenChange: (v: boolean)=>void; trade: Trade | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-[720px] ml-auto mr-0">
        <DrawerHeader>
          <DrawerTitle>{trade ? `${trade.symbol} • ${trade.side.toUpperCase()}` : 'Trade Details'}</DrawerTitle>
          <DrawerDescription>{trade?.status ?? ''}</DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Entry" value={trade?.entry_price} />
            <Field label="Exit/Mark" value={trade?.status === 'open' ? trade?.mark_price : trade?.exit_price} />
            <Field label="SL / TP" value={fmtPair(trade?.sl, trade?.tp)} />
            <Field label="Qty" value={trade?.qty} />
            <Field label="PnL (USDT)" value={trade?.pnl} colored />
            <Field label="PnL %" value={trade?.pnl_pct != null ? `${trade.pnl_pct.toFixed(2)}%` : '—'} colored />
            <Field label="Opened" value={trade?.opened_at ? new Date(trade.opened_at).toLocaleString() : '—'} />
            <Field label="Closed" value={trade?.closed_at ? new Date(trade.closed_at).toLocaleString() : '—'} />
            <Field label="Bot" value={trade?.bot_name ?? (trade?.bot_id ? `Bot #${trade.bot_id}` : '—')} />
          </div>

          <Separator />

          <h3 className="text-sm font-semibold">Quality</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Timelag" value={trade?.timelag_ms != null ? `${Math.round(trade.timelag_ms)} ms` : '—'} />
            <Field label="Slippage" value={trade?.slippage_bp != null ? `${trade.slippage_bp.toFixed(1)} bp` : '—'} />
            <Field label="Fees" value={trade?.fees_usdt != null ? `${trade.fees_usdt.toFixed(2)} USDT` : '—'} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ========================= Hilfs-UI =========================
function Field({ label, value, colored }: { label: string; value: any; colored?: boolean }) {
  const n = typeof value === 'number' ? value : NaN;
  const cls = colored ? (isNaN(n) ? '' : (n >= 0 ? 'text-emerald-600' : 'text-red-600')) : '';
  const v = value ?? '—';
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${cls}`}>{typeof v === 'number' ? v.toLocaleString() : v}</div>
    </div>
  );
}
function fmtPair(a?: number|null, b?: number|null) {
  const as = a != null ? a.toLocaleString() : '—';
  const bs = b != null ? b.toLocaleString() : '—';
  return `${as} / ${bs}`;
}

// ========================= Seite =========================
export default function TradesPage() {
  const [tab, setTab] = useState<'open'|'closed'>('open');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState('');
  const [botId, setBotId] = useState('');

  const { data = { items: [], total: 0, page: 1, page_size: pageSize } , isLoading, refetch } =
    useQuery<TradesResponse>({
      queryKey: ['trades', tab, page, pageSize, symbol, side, botId],
      queryFn: () => getTrades({
        status: tab,
        page, page_size: pageSize,
        symbol: symbol || undefined,
        side: side || undefined,
        bot_id: botId ? Number(botId) : undefined,
        sort: '-opened_at',
      }),
      placeholderData: keepPreviousData,
    });

  const items = data.items;
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  const symbols = useMemo(() => Array.from(new Set(items.map(i => i.symbol))).sort(), [items]);
  const bots = useMemo(() => {
    const m = new Map<number,string>();
    items.forEach(i => { if (i.bot_id) m.set(i.bot_id, i.bot_name ?? `Bot #${i.bot_id}`); });
    return Array.from(m.entries()).map(([id,name])=>({id,name}));
  }, [items]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Trade|null>(null);

  return (
    <Card className="max-w-[1100px] mx-auto">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle>Trades</CardTitle>
        <div className="flex gap-2">
          <TradesFilterSheet
            trigger={<Button variant="outline">Filter</Button>}
            symbol={symbol} setSymbol={setSymbol}
            side={side} setSide={setSide}
            botId={botId} setBotId={setBotId}
            symbols={symbols} bots={bots}
            apply={() => { setPage(1); refetch(); }}
          />
          <Button variant="outline" onClick={()=>refetch()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v)=>{ setTab(v as any); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4">
            {isLoading && items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No open trades.</div>
            ) : (
              <div className="grid gap-3">
                {items.map(t => (
                  <OpenTradeCard key={t.id} t={t} onDetails={(tr)=>{ setSelected(tr); setDrawerOpen(true); }} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed" className="mt-4">
            <div className="hidden md:grid grid-cols-2 md:grid-cols-6 text-xs text-muted-foreground border-b pb-2">
              <div>Symbol</div><div>Bot</div><div>Opened</div><div>Closed</div><div>PnL</div><div></div>
            </div>
            <div>
              {isLoading && items.length === 0 ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-muted-foreground">No closed trades.</div>
              ) : items.map(t => (
                <ClosedTradeRow key={t.id} t={t} onDetails={(tr)=>{ setSelected(tr); setDrawerOpen(true); }} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : `Showing ${items.length} of ${data.total} ${tab} trades`}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</Button>
            <div className="text-sm">{page} / {totalPages}</div>
            <Button size="sm" variant="outline" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</Button>
          </div>
        </div>
      </CardContent>

      <TradeDetailsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} trade={selected} />
    </Card>
  );
}
