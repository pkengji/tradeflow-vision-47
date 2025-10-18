import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FilterBar, FilterBarValue } from '@/components/FilterBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Position = {
  id: number;
  symbol: string;
  side: 'long'|'short';
  status: string;
  entry_price: number;
  qty: number;
  bot_name?: string;
  opened_at: string;
  closed_at?: string | null;
  pnl?: number;
};

export default function Trades() {
  const [filters, setFilters] = useState<FilterBarValue>({ bots: [], symbols: [], side: 'all' });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: api.getBots });
  const { data: symbols } = useQuery({ queryKey: ['symbols'], queryFn: api.getSymbols });
  const { data, isLoading } = useQuery({
    queryKey: ['positions', filters],
    queryFn: () => api.getPositions({
      status: undefined,
      bot_id: undefined,
      symbol: undefined,
    }),
  });

  const positions = useMemo<Position[]>(() => {
    const raw = data?.items ?? [];
    return raw.filter((p: any) => {
      if (filters.side !== 'all' && p.side !== filters.side) return false;
      if (filters.symbols.length && !filters.symbols.includes(p.symbol)) return false;
      if (filters.bots.length && !filters.bots.includes(p.bot_name)) return false;
      return true;
    });
  }, [data, filters]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <FilterBar
            bots={(bots ?? []).map((b: any)=> b.name)}
            symbols={(symbols ?? []).map((s: any)=> s.name ?? s.symbol ?? s)}
            value={filters}
            onChange={setFilters}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trades</CardTitle>
          <Badge variant="secondary">{positions.length} Einträge</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-2">{Array.from({length:6}).map((_,i)=>(<Skeleton key={i} className="h-10 w-full" />))}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Bot</th>
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Side</th>
                    <th className="py-2 pr-4">Entry</th>
                    <th className="py-2 pr-4">QTY</th>
                    <th className="py-2 pr-4">PnL</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Opened</th>
                    <th className="py-2 pr-4">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-4">{p.id}</td>
                      <td className="py-2 pr-4">{p.bot_name ?? '—'}</td>
                      <td className="py-2 pr-4">{p.symbol}</td>
                      <td className="py-2 pr-4">{p.side}</td>
                      <td className="py-2 pr-4">{p.entry_price}</td>
                      <td className="py-2 pr-4">{p.qty}</td>
                      <td className="py-2 pr-4">{typeof p.pnl === 'number' ? p.pnl.toFixed(2) : '—'}</td>
                      <td className="py-2 pr-4">{p.status}</td>
                      <td className="py-2 pr-4">{p.opened_at ? new Date(p.opened_at).toLocaleString() : '—'}</td>
                      <td className="py-2 pr-4">{p.closed_at ? new Date(p.closed_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
