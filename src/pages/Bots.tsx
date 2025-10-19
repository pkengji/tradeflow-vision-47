import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Pause, Play, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function Bots() {
  const qc = useQueryClient();
  const { data: bots, isLoading, refetch } = useQuery({
    queryKey: ['bots'],
    queryFn: api.getBots,
  });

  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Toggle Auto-Approve
  const toggleAA = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      api.setBotAutoApprove(id, value),
    onMutate: async ({ id, value }) => {
      await qc.cancelQueries({ queryKey: ['bots'] });
      const prev = qc.getQueryData<Bot[]>(['bots']);
      qc.setQueryData<Bot[]>(['bots'], old =>
        (old ?? []).map(b => (b.id === id ? { ...b, auto_approve: value } : b))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['bots'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['bots'] }),
  });

  // Beispielhafte Mutations-Platzhalter für Pause/Löschen
  const pauseBot = async (id: number) => {
    setLoadingId(id);
    await new Promise(res => setTimeout(res, 400)); // hier später API-Call
    setLoadingId(null);
  };
  const deleteBot = async (id: number) => {
    if (!confirm('Bot wirklich löschen?')) return;
    setLoadingId(id);
    await new Promise(res => setTimeout(res, 400)); // hier später API-Call
    setLoadingId(null);
    qc.invalidateQueries({ queryKey: ['bots'] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Trading-Bots</CardTitle>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Lade Bots…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Strategie</th>
                    <th className="py-2 pr-4">Timeframe</th>
                    <th className="py-2 pr-4">Auto-Approve</th>
                    <th className="py-2 pr-4">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {(bots ?? []).map(b => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4">
                        <Link
                          to={`/bots/${b.id}`}
                          className="underline hover:no-underline text-blue-600"
                        >
                          {b.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{b.strategy ?? '—'}</td>
                      <td className="py-2 pr-4">{b.timeframe ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!b.auto_approve}
                            onCheckedChange={v =>
                              toggleAA.mutate({ id: b.id, value: v })
                            }
                          />
                          {b.auto_approve ? (
                            <Badge variant="default">aktiv</Badge>
                          ) : (
                            <Badge variant="secondary">aus</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            disabled={loadingId === b.id}
                            onClick={() => pauseBot(b.id)}
                            title="Pausieren"
                          >
                            <Pause size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            asChild
                            title="Bearbeiten"
                          >
                            <Link to={`/bots/${b.id}`}>
                              <Edit2 size={14} />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            disabled={loadingId === b.id}
                            onClick={() => deleteBot(b.id)}
                            title="Löschen"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
