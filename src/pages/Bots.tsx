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
          <p className="text-muted-foreground">Verwalten Sie Ihre Trading Bots</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Bot
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bots?.map((bot) => (
          <Card key={bot.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{bot.name}</CardTitle>
                  {bot.description && (
                    <p className="text-sm text-muted-foreground mt-1">{bot.description}</p>
                  )}
                </div>
                <div className={`h-2 w-2 rounded-full ${bot.isActive ? 'bg-success' : 'bg-muted'}`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Exchange</span>
                <Badge variant="outline">{bot.exchange}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                  {bot.isActive ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Bearbeiten
                </Button>
                <Button 
                  variant={bot.isActive ? 'destructive' : 'default'} 
                  size="sm" 
                  className="flex-1"
                >
                  {bot.isActive ? 'Deaktivieren' : 'Aktivieren'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!bots || bots.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Keine Bots vorhanden</p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ersten Bot erstellen
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
