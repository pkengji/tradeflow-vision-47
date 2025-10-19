import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { Copy } from 'lucide-react';

export default function BotDetail() {
  const { id } = useParams();
  const botId = Number(id);
  const qc = useQueryClient();

  const { data: bot, isLoading, refetch } = useQuery({
    queryKey: ['bot', botId],
    queryFn: async () => {
      const all = await api.getBots();
      return all.find((b: Bot) => b.id === botId);
    },
    enabled: !isNaN(botId),
  });

  const mut = useMutation({
    mutationFn: ({ value }: { value: boolean }) =>
      api.setBotAutoApprove(botId, value),
    onMutate: async ({ value }) => {
      await qc.cancelQueries({ queryKey: ['bot', botId] });
      const prev = qc.getQueryData<Bot>(['bot', botId]);
      qc.setQueryData<Bot>(['bot', botId], (old) =>
        old ? { ...old, auto_approve: value } : old
      );
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['bot', botId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['bot', botId] }),
  });

  const [copied, setCopied] = useState<string | null>(null);
  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (isLoading || !bot) return <div>Lade Bot-Details…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {bot.name}
            <Badge variant="secondary" className="ml-2">
              {bot.strategy ?? '—'} · {bot.timeframe ?? '—'}
            </Badge>
          </CardTitle>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* === Identifikationsdaten === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <Label>UUID</Label>
              <div className="flex items-center gap-2">
                <code className="text-xs">{bot.uuid ?? '—'}</code>
                {bot.uuid && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(bot.uuid!, 'uuid')}
                  >
                    <Copy size={14} />
                  </Button>
                )}
              </div>
              {copied === 'uuid' && (
                <div className="text-[11px] text-green-600 mt-1">
                  Kopiert!
                </div>
              )}
            </div>

            <div>
              <Label>Secret</Label>
              <div className="flex items-center gap-2">
                <code className="text-xs">{bot.secret ?? '—'}</code>
                {bot.secret && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(bot.secret!, 'secret')}
                  >
                    <Copy size={14} />
                  </Button>
                )}
              </div>
              {copied === 'secret' && (
                <div className="text-[11px] text-green-600 mt-1">
                  Kopiert!
                </div>
              )}
            </div>
          </div>

          {/* === Hebel & RRR === */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm">
            <div>
              <Label>Leverage</Label>
              <div>{bot.max_leverage ?? '—'}</div>
            </div>
            <div>
              <Label>TV-Risk-Multiplier</Label>
              <div>{bot.tv_risk_multiplier_default ?? '—'}</div>
            </div>
            <div>
              <Label>Timeframe</Label>
              <div>{bot.timeframe ?? '—'}</div>
            </div>
          </div>

          {/* === Auto-Approve === */}
          <div className="mt-6 flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="autoApprove" className="text-sm">
                Auto-Approve aktivieren
              </Label>
              <Switch
                id="autoApprove"
                checked={!!bot.auto_approve}
                onCheckedChange={(v) => mut.mutate({ value: v })}
              />
            </div>
            {bot.auto_approve ? (
              <Badge variant="default">Aktiv</Badge>
            ) : (
              <Badge variant="secondary">Deaktiviert</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
