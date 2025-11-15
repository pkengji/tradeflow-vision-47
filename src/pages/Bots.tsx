import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function Bots() {
  const qc = useQueryClient();
  const { data: bots, isLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: api.getBots,
  });

  const { data: botsWithSymbolCount } = useQuery({
    queryKey: ['bots-with-counts'],
    queryFn: async () => {
      const allBots = await api.getBots();
      const withCounts = await Promise.all(
        allBots.map(async (bot) => {
          try {
            const symbols = await api.getBotSymbols(bot.id);
            return { ...bot, pairs_count: symbols?.filter(s => s.enabled).length || 0 };
          } catch {
            return { ...bot, pairs_count: 0 };
          }
        })
      );
      return withCounts;
    },
    enabled: !!bots,
  });

  const toggleAutoApproveMutation = useMutation({
    mutationFn: async ({ botId, newValue }: { botId: number; newValue: boolean }) => {
      return api.setBotAutoApprove(botId, newValue);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const visibleBots = (botsWithSymbolCount ?? bots ?? []).filter(b => b.status !== 'deleted' && !b.is_deleted);

  const handleAutoApproveToggle = (e: React.MouseEvent, bot: Bot) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAutoApproveMutation.mutate({ botId: bot.id, newValue: !bot.auto_approve });
  };

  return (
    <DashboardLayout pageTitle="Bots">
      <div className="space-y-4 p-4 pb-24">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Lade Bots…</div>
        ) : (
          <div className="space-y-3">
            {visibleBots.map(bot => (
              <Link
                key={bot.id}
                to={`/bots/${bot.id}`}
                className="block p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-3 h-3 rounded-full mt-1 ${getStatusColor(bot.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-medium">{bot.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {bot.account_kind === 'main' ? 'Main' : 'Sub'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Am Laufen seit: {bot.created_at ? new Date(bot.created_at).toLocaleDateString('de-CH') : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Anzahl Pairs: {(bot as any).pairs_count || 0}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs text-muted-foreground">Auto-Approve</div>
                    <Switch
                      checked={!!bot.auto_approve}
                      onCheckedChange={(checked) => toggleAutoApproveMutation.mutate({ botId: bot.id, newValue: checked })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </Link>
            ))}
            {visibleBots.length === 0 && (
              <div className="text-sm text-muted-foreground">Keine Bots gefunden.</div>
            )}
          </div>
        )}

        {/* Fixed Button unten */}
        <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 bg-card border-t p-3 z-50">
          <Button asChild size="default" className="w-full">
            <Link to="/bots/new">
              <Plus className="mr-2 h-5 w-5" />
              Neuer Bot
            </Link>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
