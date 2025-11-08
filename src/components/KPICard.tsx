import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

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
    if (format === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(val);
    if (format === 'percentage') return new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2 }).format(val as number);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(val);
  };

  const deltaColor = !delta ? 'text-muted-foreground' : delta > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {typeof delta === 'number' && (
          <p className={`text-xs ${deltaColor} mt-1`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}% vs. prior
          </p>
        )}
      </CardContent>
    </Card>
  );
}
