import { useQuery } from '@tanstack/react-query';
import { KPICard } from '@/components/KPICard';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Activity, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { data: pnl } = useQuery({ queryKey: ['pnl-daily'], queryFn: () => api.getDailyPnl({ days: 30 }) });

  const totalPnl = (pnl ?? []).reduce((acc: number, p: any) => acc + (p.pnl ?? 0), 0);
  const winDays = (pnl ?? []).filter((p: any) => (p.pnl ?? 0) > 0).length;
  const lossDays = (pnl ?? []).filter((p: any) => (p.pnl ?? 0) < 0).length;
  const last = (pnl ?? [])[pnl?.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard title="Gesamt PnL (30d)" value={totalPnl} icon={DollarSign} format="currency" />
        <KPICard title="Gewinn-Tage" value={winDays} icon={TrendingUp} />
        <KPICard title="Verlust-Tage" value={lossDays} icon={Activity} />
        <KPICard title="Letzter Tag" value={(last?.pnl ?? 0)} icon={Clock} format="currency" />
      </div>

      <Card>
        <CardHeader><CardTitle>Daily PnL</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnl ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="pnl" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
