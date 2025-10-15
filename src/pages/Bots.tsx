import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function Bots() {
  const { data: bots } = useQuery({
    queryKey: ['bots'],
    queryFn: () => api.getBots(),
  });

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bots</h1>
          <p className="text-muted-foreground">Manage your trading bots</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Bot
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bots?.map((bot) => (
          <Card key={bot.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{bot.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{bot.strategy} • {bot.timeframe}</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-success" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Strategy</span>
                <Badge variant="outline">{bot.strategy}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Timeframe</span>
                <Badge variant="outline">{bot.timeframe}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk Multiplier</span>
                <span className="text-sm font-medium">{bot.tv_risk_multiplier_default}x</span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Edit
                </Button>
                <Button 
                  variant='destructive' 
                  size="sm" 
                  className="flex-1"
                >
                  Stop
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!bots || bots.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No bots available</p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create first bot
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
