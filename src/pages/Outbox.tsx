import { useEffect, useState } from 'react';
import api, { type OutboxItem } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type PreviewMap = Record<number, any>;

export default function OutboxPage() {
  const [rows, setRows] = useState<OutboxItem[]>([]);
  const [status, setStatus] = useState<string>('queued');
  const [previewById, setPreviewById] = useState<PreviewMap>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  async function load() {
    const data = await api.getOutbox({ status, limit: 200 });
    setRows(data);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function togglePreview(id: number) {
    if (previewById[id]) {
      const next = { ...previewById };
      delete next[id];
      setPreviewById(next);
      return;
    }
    try {
      setLoadingId(id);
      const p = await api.previewOutbox(id);
      setPreviewById(prev => ({ ...prev, [id]: p }));
    } finally {
      setLoadingId(null);
    }
  }

  async function approve(id: number) {
    await api.approveOutbox(id);
    await load();
  }
  async function reject(id: number) {
    await api.rejectOutbox(id);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Postausgang</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {['queued','approved','rejected','sent','failed',''].map(s => (
                <option key={s || 'all'} value={s}>{s || 'alle'}</option>
              ))}
            </select>
            <Button variant="outline" onClick={load}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <b>#{r.id}</b> · {r.kind} · pos {r.position_id ?? '—'}
                </div>
                <Badge className="uppercase" variant={r.status === 'queued' ? 'default' : 'secondary'}>
                  {r.status}
                </Badge>
              </div>

              {r.payload && (
                <>
                  <div className="mt-2 text-[11px] text-muted-foreground">Payload</div>
                  <pre className="mt-1 text-xs bg-muted/40 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                </>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => togglePreview(r.id)}>
                  {loadingId === r.id
                    ? 'Lade Preview…'
                    : previewById[r.id] ? 'Preview ausblenden' : 'Preview anzeigen'}
                </Button>
                <Button onClick={() => approve(r.id)} disabled={r.status !== 'queued'}>
                  Approve
                </Button>
                <Button variant="outline" onClick={() => reject(r.id)} disabled={r.status !== 'queued'}>
                  Reject
                </Button>
              </div>

              {previewById[r.id] && (
                <>
                  <div className="mt-3 text-[11px] text-muted-foreground">Dispatch Preview</div>
                  <pre className="mt-1 text-xs bg-muted/40 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(previewById[r.id], null, 2)}
                  </pre>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
