import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { apiGet } from '@/lib/api';
import type { components } from '@/types/openapi';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, ArrowUpDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PositionsResponse = components['schemas']['PositionsResponse'];
type PositionOut = components['schemas']['PositionOut'];

async function fetchPositions(opts: { status?: 'open' | 'closed'; bot_id?: number; symbol?: string }) {
  const data = await apiGet<PositionsResponse>('/positions', opts);
  return data.items ?? [];
}

const columnHelper = createColumnHelper<PositionOut>();

export default function Trades() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  const status = (searchParams.get('status') as 'open' | 'closed') || 'open';

  const { data: openPositions = [], isLoading: loadingOpen } = useQuery({
    queryKey: ['positions', { status: 'open' }],
    queryFn: () => fetchPositions({ status: 'open' }),
    staleTime: 30_000,
  });

  const { data: closedPositions = [], isLoading: loadingClosed } = useQuery({
    queryKey: ['positions', { status: 'closed' }],
    queryFn: () => fetchPositions({ status: 'closed' }),
    staleTime: 30_000,
  });

  const positions = status === 'open' ? openPositions : closedPositions;
  const isLoading = status === 'open' ? loadingOpen : loadingClosed;

  const formatPrice = (price: number, symbol: string) => {
    const decimals = symbol.includes('USD') ? 2 : 4;
    return price.toFixed(decimals);
  };

  const formatPnl = (pnl: number | null) => {
    if (pnl === null) return '-';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(pnl);
    return pnl >= 0 ? `+${formatted}` : formatted;
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('symbol', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            Symbol <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: (info) => <span className="font-mono font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('side', {
        header: 'Side',
        cell: (info) => {
          const side = info.getValue();
          return (
            <Badge variant={side === 'long' ? 'default' : 'destructive'} className="gap-1">
              {side === 'long' ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {side.toUpperCase()}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('leverage', {
        header: 'Lev',
        cell: (info) => <span className="font-medium">{info.getValue()}x</span>,
      }),
      columnHelper.accessor('entry_price', {
        header: 'Entry',
        cell: (info) => (
          <span className="font-mono text-sm">
            {formatPrice(info.getValue(), info.row.original.symbol)}
          </span>
        ),
      }),
      columnHelper.accessor('tp_trigger', {
        header: 'TP',
        cell: (info) => (
          <span className="font-mono text-sm text-success">
            {formatPrice(info.getValue(), info.row.original.symbol)}
          </span>
        ),
      }),
      columnHelper.accessor('sl_trigger', {
        header: 'SL',
        cell: (info) => (
          <span className="font-mono text-sm text-danger">
            {formatPrice(info.getValue(), info.row.original.symbol)}
          </span>
        ),
      }),
      columnHelper.accessor('realized_pnl_net_usdt', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            PnL <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: (info) => {
          const pnl = info.getValue();
          return (
            <span
              className={cn(
                'font-mono font-semibold',
                pnl !== null && pnl > 0 && 'text-success',
                pnl !== null && pnl < 0 && 'text-danger'
              )}
            >
              {formatPnl(pnl)}
            </span>
          );
        },
      }),
      columnHelper.accessor('entry_fee_total_usdt', {
        header: 'Fee',
        cell: (info) => <span className="font-mono text-sm">${info.getValue().toFixed(2)}</span>,
      }),
      columnHelper.accessor('funding_total_usdt', {
        header: 'Funding',
        cell: (info) => {
          const funding = info.getValue();
          return (
            <span
              className={cn(
                'font-mono text-sm',
                funding > 0 && 'text-danger',
                funding < 0 && 'text-success'
              )}
            >
              ${funding.toFixed(2)}
            </span>
          );
        },
      }),
      columnHelper.accessor('opened_at', {
        header: 'Opened',
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {new Date(info.getValue()).toLocaleString('de-CH', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: positions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (density === 'compact' ? 40 : 52),
    overscan: 10,
  });

  const handleStatusChange = (newStatus: string) => {
    setSearchParams({ status: newStatus });
  };

  return (
    <div className="flex flex-col h-full p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Trades</h1>
        <p className="text-sm text-muted-foreground">Open and closed positions</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Tabs value={status} onValueChange={handleStatusChange} className="w-auto">
          <TabsList>
            <TabsTrigger value="open">Open ({openPositions.length})</TabsTrigger>
            <TabsTrigger value="closed">Closed ({closedPositions.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        >
          {density === 'compact' ? 'Comfortable' : 'Compact'}
        </Button>
      </div>

      <div className="flex-1 border rounded-lg overflow-hidden bg-card">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>No {status} positions found</p>
          </div>
        ) : (
          <div ref={parentRef} className="h-[calc(100vh-280px)] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card border-b z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={cn(
                          'text-left px-4 text-xs font-medium text-muted-foreground',
                          density === 'compact' ? 'py-2' : 'py-3'
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                  <td />
                </tr>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/trades/${row.original.id}`)}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      style={{
                        position: 'absolute',
                        transform: `translateY(${virtualRow.start}px)`,
                        width: '100%',
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-4',
                            density === 'compact' ? 'py-2' : 'py-3'
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
