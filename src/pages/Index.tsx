import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import TradeDetailPanel from '@/components/app/TradeDetailPanel'
import MiniRange from '@/components/app/MiniRange'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trade, setTrade] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    const fetchTrade = async () => {
      setLoading(true)
      try {
        const tradeData = await api.getPosition(Number(id))
        setTrade(tradeData)
      } catch (err) {
        console.error('Failed to fetch trade', err)
      } finally {
        setLoading(false)
      }
    }
    fetchTrade()
  }, [id])

  if (loading) return <div className="p-6">Loading trade...</div>
  if (!trade) return <div className="p-6">Trade not found</div>

  return (
    <div className="flex flex-col gap-4 p-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/trades')}
        className="flex items-center gap-2 w-fit"
      >
        <ArrowLeft size={16} /> Back to trades
      </Button>

      <div className="flex flex-col gap-6">
        {/* MiniRange oben, wie früher */}
        <MiniRange
          sl={trade.sl}
          entry={trade.entry_price_vwap}
          tp={trade.tp}
          mark={trade.mark_price}
          labelEntry="ENTRY"
        />

        <TradeDetailPanel positionId={Number(id)} />
      </div>
    </div>
  )
}
