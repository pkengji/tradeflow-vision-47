import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: number;
  icon: LucideIcon;
  format?: 'currency' | 'percentage' | 'number';
}

export function KPICard({ title, value, delta, icon: Icon, format = 'number' }: KPICardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val;
    
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('de-CH', {
          style: 'currency',
          currency: 'USD',
        }).format(val);
      case 'percentage':
        return `${val.toFixed(2)}%`;
      default:
        return val.toLocaleString('de-CH');
    }
  };

  const deltaColor = delta && delta > 0 ? 'text-success' : 'text-danger';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {delta !== undefined && (
          <p className={`text-xs ${deltaColor} mt-1`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}% vom Vorzeitraum
          </p>
        )}
      </CardContent>
    </Card>
  );
}
