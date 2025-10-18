import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TradeDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const { data: position } = useQuery({ queryKey: ['position', pid], queryFn: () => api.getPosition(pid), enabled: !isNaN(pid) });
  const { data: orders } = useQuery({ queryKey: ['orders', pid], queryFn: () => api.getOrders(pid), enabled: !isNaN(pid) });
  const { data: funding } = useQuery({ queryKey: ['funding', pid], queryFn: () => api.getFunding(pid), enabled: !isNaN(pid) });

  if (isNaN(pid)) return <div>Ungültige ID</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Position</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs overflow-auto">{JSON.stringify(position, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs overflow-auto">{JSON.stringify(orders, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Funding</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs overflow-auto">{JSON.stringify(funding, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
