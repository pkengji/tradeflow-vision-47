import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { KPICard } from '@/components/KPICard';
import { FilterBar } from '@/components/FilterBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Activity, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DateRange } from 'react-day-picker';

export default function Dashboard() {
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [side, setSide] = useState<'all' | 'long' | 'short'>('all');

  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.getPositions(),
  });

  const { data: bots } = useQuery({
    queryKey: ['bots'],
    queryFn: () => api.getBots(),
  });

  const { data: symbolsData } = useQuery({
    queryKey: ['symbols'],
    queryFn: () => api.getSymbols(),
  });

  // Extract unique bot names and pairs
  const availableBots = Array.from(new Set(bots?.map(b => b.name) || []));
  const availablePairs = Array.from(new Set(symbolsData?.map((s: any) => s.symbol) || []));

  const handleResetFilters = () => {
    setSelectedBots([]);
    setSelectedPairs([]);
    setDateRange(undefined);
    setSide('all');
  };

  // Calculate KPIs
  const totalPnL = positions?.positions.reduce((sum, p) => sum + (p.pnl || 0), 0) || 0;
  const totalTrades = positions?.total || 0;
  const winningTrades = positions?.positions.filter(p => (p.pnl || 0) > 0).length || 0;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgTimelag = positions?.positions.reduce((sum, p) => sum + (p.timelagMs || 0), 0) || 0 / (totalTrades || 1);

  // Mock equity curve data
  const equityCurve = [
    { date: '01.01', value: 10000 },
    { date: '02.01', value: 10250 },
    { date: '03.01', value: 10100 },
    { date: '04.01', value: 10500 },
    { date: '05.01', value: 10750 },
    { date: '06.01', value: totalPnL + 10000 },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Trading Portfolio Overview</p>
      </div>

      <FilterBar
        bots={availableBots}
        pairs={availablePairs}
        selectedBots={selectedBots}
        selectedPairs={selectedPairs}
        dateRange={dateRange}
        side={side}
        onBotsChange={setSelectedBots}
        onPairsChange={setSelectedPairs}
        onDateRangeChange={setDateRange}
        onSideChange={setSide}
        onReset={handleResetFilters}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Gesamt PnL"
          value={totalPnL}
          delta={12.5}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          title="Win Rate"
          value={winRate}
          delta={2.3}
          icon={TrendingUp}
          format="percentage"
        />
        <KPICard
          title="Anzahl Trades"
          value={totalTrades}
          icon={Activity}
          format="number"
        />
        <KPICard
          title="Ø Timelag"
          value={`${Math.round(avgTimelag)}ms`}
          icon={Clock}
        />
      </div>

      {/* Equity Curve */}
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Portfolio']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Active Bots */}
      <Card>
        <CardHeader>
          <CardTitle>Aktive Bots ({bots?.filter(b => b.isActive).length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {bots?.filter(b => b.isActive).map(bot => (
              <div key={bot.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{bot.name}</div>
                  <div className="text-sm text-muted-foreground">{bot.exchange}</div>
                </div>
                <div className="flex h-2 w-2 rounded-full bg-success" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
