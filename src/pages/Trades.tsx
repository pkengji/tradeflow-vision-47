import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TradeCard } from '@/components/TradeCard';

export default function Trades() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');

  const { data: positionsData } = useQuery({
    queryKey: ['positions', status],
    queryFn: () => api.getPositions({ status }),
  });

  const positions = positionsData?.positions || [];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Trades</h1>
        <p className="text-sm text-muted-foreground">Offene und geschlossene Positionen</p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as 'open' | 'closed')} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">
            Active ({positions.filter(p => p.status === 'open').length})
          </TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">
            Closed ({positions.filter(p => p.status === 'closed').length})
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
