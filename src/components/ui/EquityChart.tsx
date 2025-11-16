
import { useState } from "react";

type Point = { date: string; pnl: number; equity: number };

export default function EquityChart({ data }: { data: Point[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; point: Point } | null>(null);
  
  const width = 600, height = 180, pad = 24;
  if (!data || data.length === 0) return <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Keine Daten</div>;
  
  const xs = data.map(d => new Date(d.date).getTime());
  const ys = data.map(d => d.equity);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yPadding = (maxY - minY) * 0.1;
  const scaledMinY = minY - yPadding;
  const scaledMaxY = maxY + yPadding;
  
  const x = (t: number) => pad + ((t - minX) / (maxX - minX || 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - scaledMinY) / (scaledMaxY - scaledMinY || 1)) * (height - 2 * pad);
  
  const path = ys.map((v, i) => (i === 0 ? `M ${x(xs[i])} ${y(v)}` : `L ${x(xs[i])} ${y(v)}`)).join(" ");

  const formatCurrency = (value: number) => {
    return `$ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
  };

  return (
    <div className="relative">
      <svg 
        width={width} 
        height={height} 
        className="w-full h-[180px]"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const relativeX = (mouseX - pad) / (width - 2 * pad);
          const dataIndex = Math.round(relativeX * (data.length - 1));
          
          if (dataIndex >= 0 && dataIndex < data.length) {
            const point = data[dataIndex];
            const pointX = x(new Date(point.date).getTime());
            const pointY = y(point.equity);
            setHoveredPoint({ x: pointX, y: pointY, point });
          }
        }}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
        
        {hoveredPoint && (
          <circle 
            cx={hoveredPoint.x} 
            cy={hoveredPoint.y} 
            r={4} 
            fill="currentColor" 
          />
        )}
      </svg>
      
      {hoveredPoint && (
        <div 
          className="absolute bg-background border rounded-lg shadow-lg p-3 pointer-events-none z-10"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${Math.max(10, hoveredPoint.y - 80)}px`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="text-xs text-muted-foreground mb-1">
            {formatDate(hoveredPoint.point.date)}
          </div>
          <div className="text-sm font-medium">
            Portfolio: {formatCurrency(hoveredPoint.point.equity)}
          </div>
          <div 
            className={`text-sm font-medium ${hoveredPoint.point.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            P&L: {hoveredPoint.point.pnl >= 0 ? '+' : ''}{formatCurrency(hoveredPoint.point.pnl)}
          </div>
        </div>
      )}
    </div>
  );
}
