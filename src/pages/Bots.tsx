import { useQuery } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function Bots() {
  const { data: bots, isLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: api.getBots,
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const visibleBots = (bots ?? []).filter(b => b.status !== 'deleted');

  return (
    <div className="space-y-6 p-4 lg:p-6 pb-24">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Trading-Bots</h1>
        <p className="text-sm text-muted-foreground">Übersicht deiner Trading-Bots</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Lade Bots…</div>
      ) : (
        <div className="space-y-3">
          {visibleBots.map(bot => (
            <Link
              key={bot.id}
              to={`/bots/${bot.id}`}
              className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <div className={`w-3 h-3 rounded-full ${getStatusColor(bot.status)}`} />
              <div className="flex-1 font-medium">{bot.name}</div>
              <Switch
                checked={!!bot.auto_approve}
                onClick={(e) => e.preventDefault()}
                className="pointer-events-none"
              />
            </Link>
          ))}
          {visibleBots.length === 0 && (
            <div className="text-sm text-muted-foreground">Keine Bots gefunden.</div>
          )}
        </div>
      )}

      {/* Sticky Button unten */}
      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 z-50 pointer-events-none">
        <Button asChild size="lg" className="shadow-lg pointer-events-auto bg-primary">
          <Link to="/bots/new">
            <Plus className="mr-2 h-5 w-5" />
            Neuer Bot
          </Link>
        </Button>
      </div>
    </div>
  );
}
