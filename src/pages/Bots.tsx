import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Bots() {
  const { data } = useQuery({ queryKey: ['bots'], queryFn: api.getBots });

  return (
    <Card>
      <CardHeader><CardTitle>Bots</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">UUID</th>
                <th className="py-2 pr-4">Secret</th>
                <th className="py-2 pr-4">Leverage</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((b: any) => (
                <tr key={b.id} className="border-b">
                  <td className="py-2 pr-4">{b.name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{b.uuid ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{b.secret ?? '—'}</td>
                  <td className="py-2 pr-4">{b.max_leverage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
