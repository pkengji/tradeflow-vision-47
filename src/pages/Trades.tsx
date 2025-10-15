// src/pages/Trades.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TradeCard } from '@/components/TradeCard';

// 🔁 neuer zentraler GET-Wrapper
import { apiGet } from '@/lib/api';
// ✅ OpenAPI-Typen (per openapi-typescript generiert: src/types/openapi.ts)
import type { components } from '@/types/openapi';

// --- API Types aus OpenAPI ---
type PositionsResponse = components['schemas']['PositionsResponse'];
type PositionOut = components['schemas']['PositionOut'];

// --- Fetch-Funktion: /positions -> { items: PositionOut[] }
async function fetchPositions(opts: { status?: 'open' | 'closed'; bot_id?: number; symbol?: string }) {
  const data = await apiGet<PositionsResponse>('/positions', opts);
  return data.items ?? [];
}

export default function Trades() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');

  // Zahlen in den Tabs: getrennt laden (leicht gecacht, schnell)
  const { data: openPositions = [] } = useQuery({
    queryKey: ['positions', { status: 'open' }],
    queryFn: () => fetchPositions({ status: 'open' }),
    staleTime: 30_000,
  });

  const { data: closedPositions = [] } = useQuery({
    queryKey: ['positions', { status: 'closed' }],
    queryFn: () => fetchPositions({ status: 'closed' }),
    staleTime: 30_000,
  });

  // Liste für das aktive Tab
  const positions: PositionOut[] = status === 'open' ? openPositions : closedPositions;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Trades</h1>
        <p className="text-sm text-muted-foreground">Offene und geschlossene Positionen</p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as 'open' | 'closed')} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">
            Active ({openPositions.length})
          </TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">
            Closed ({closedPositions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={status} className="space-y-3 mt-4">
          {positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Keine {status === 'open' ? 'offenen' : 'geschlossenen'} Positionen</p>
            </div>
          ) : (
            positions.map((position) => (
              <TradeCard key={position.id} position={position} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
