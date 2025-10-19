import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { Pause, Play, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function Bots() {
  const qc = useQueryClient();
  const { data: bots, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bots'],
    queryFn: api.getBots,
  });

  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Auto-Approve toggeln (optimistic update)
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
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['bots'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['bots'] }),
  });

  // Pausieren/Fortsetzen
  const pauseMutation = useMutation({
    mutationFn: ({ id, pause }: { id: number; pause: boolean }) =>
      pause ? api.pauseBot(id) : api.resumeBot(id),
    onMutate: async ({ id, pause }) => {
      setLoadingId(id);
      await qc.cancelQueries({ queryKey: ['bots'] });
      const prev = qc.getQueryData<Bot[]>(['bots']);
      qc.setQueryData<Bot[]>(['bots'], old =>
        (old ?? []).map(b =>
          b.id === id ? { ...b, status: pause ? 'paused' : 'active' } : b
        )
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['bots'], ctx.prev);
    },
    onSettled: () => {
      setLoadingId(null);
      qc.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  // Löschen
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBot(id),
    onMutate: async (id) => {
      setLoadingId(id);
      await qc.cancelQueries({ queryKey: ['bots'] });
      const prev = qc.getQueryData<Bot[]>(['bots']);
      qc.setQueryData<Bot[]>(['bots'], old => (old ?? []).filter(b => b.id !== id));
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['bots'], ctx.prev);
    },
    onSettled: () => {
      setLoadingId(null);
      qc.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Trading-Bots</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              Refresh
            </Button>
            <Button asChild>
              <Link to="/bots/new">Neuer Bot</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Lade Bots…</div>
          ) : isError ? (
            <div className="text-sm text-red-600">
              Fehler beim Laden: {(error as any)?.message ?? 'Unbekannter Fehler'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Strategie</th>
                    <th className="py-2 pr-4">Timeframe</th>
                    <th className="py-2 pr-4">Status</th>
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
                        {b.status === 'active' ? (
                          <Badge variant="default">aktiv</Badge>
                        ) : b.status === 'paused' ? (
                          <Badge variant="secondary">pausiert</Badge>
                        ) : (
                          <Badge variant="destructive">gelöscht</Badge>
                        )}
                      </td>
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
                          {b.status === 'active' ? (
                            <Button
                              size="icon"
                              variant="outline"
                              disabled={loadingId === b.id}
                              onClick={() => pauseMutation.mutate({ id: b.id, pause: true })}
                              title="Pausieren"
                            >
                              <Pause size={14} />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="outline"
                              disabled={loadingId === b.id}
                              onClick={() => pauseMutation.mutate({ id: b.id, pause: false })}
                              title="Fortsetzen"
                            >
                              <Play size={14} />
                            </Button>
                          )}
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
                            onClick={() => {
                              if (confirm('Bot wirklich löschen?')) deleteMutation.mutate(b.id);
                            }}
                            title="Löschen"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(bots ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 opacity-70">
                        Keine Bots gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
