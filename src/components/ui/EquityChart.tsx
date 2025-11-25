
import { useState, useRef, useEffect } from "react";

type Point = { date: string; pnl: number; equity: number };

export default function EquityChart({ data }: { data: Point[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; point: Point } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const touchStartRef = useRef<{ dist: number; zoom: number; x: number; panX: number } | null>(null);
  
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  
  // Adaptive dimensions: smaller viewBox width on mobile means data gets compressed horizontally
  const width = isMobile ? 400 : 800;
  const height = 240;
  const pad = 40;
  const padBottom = 50;
  const padLeft = 60;
  
  // Debug log to check data
  console.log('EquityChart data:', data);
  
  if (!data || data.length === 0) return <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Keine Daten</div>;
  
  // Filter out invalid data points and parse dates safely
  const validData = data.filter(d => d && d.date && d.equity != null && d.pnl != null);
  console.log('EquityChart validData:', validData);
  
  if (validData.length === 0) return <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Keine gültigen Daten</div>;
  
  const xs = validData.map(d => {
    const timestamp = new Date(d.date).getTime();
    return isNaN(timestamp) ? 0 : timestamp;
  });
  const ys = validData.map(d => d.equity);
  
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yPadding = (maxY - minY) * 0.1;
  const scaledMinY = minY - yPadding;
  const scaledMaxY = maxY + yPadding;
  
  const x = (t: number) => {
    if (isNaN(t)) return padLeft;
    return padLeft + ((t - minX) / (maxX - minX || 1)) * (width - padLeft - pad);
  };
  const y = (v: number) => {
    if (isNaN(v)) return height - padBottom;
    return height - padBottom - ((v - scaledMinY) / (scaledMaxY - scaledMinY || 1)) * (height - pad - padBottom);
  };
  
  const path = ys.map((v, i) => (i === 0 ? `M ${x(xs[i])} ${y(v)}` : `L ${x(xs[i])} ${y(v)}`)).join(" ");

  const formatCurrency = (value: number) => {
    return `$ ${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    // Handle ISO 8601 dates with timezone info
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    // Format in local timezone
    return date.toLocaleDateString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Generate Y-axis labels with rounded values
  const range = maxY - minY;
  const getNiceStep = (range: number): number => {
    const rawStep = range / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    
    if (normalized <= 1) return magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
  };
  
  const step = getNiceStep(range);
  const startValue = Math.floor(minY / step) * step;
  const yTickValues: number[] = [];
  for (let value = startValue; value <= maxY + step; value += step) {
    if (value >= minY - step * 0.5) {
      yTickValues.push(value);
    }
  }

  // Generate X-axis labels (fewer on mobile to avoid crowding)
  const xTickCount = isMobile ? Math.min(3, validData.length) : Math.min(5, validData.length);
  const xTickIndices = Array.from({ length: xTickCount }, (_, i) => {
    return Math.floor((i / (xTickCount - 1)) * (validData.length - 1));
  });

  // Touch handlers for pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      
      touchStartRef.current = { dist, zoom, x: midX, panX };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      
      const scale = dist / touchStartRef.current.dist;
      const newZoom = Math.max(1, Math.min(10, touchStartRef.current.zoom * scale));
      
      // Calculate pan to keep zoom centered on pinch point
      const deltaX = midX - touchStartRef.current.x;
      const newPanX = touchStartRef.current.panX + deltaX;
      
      setZoom(newZoom);
      setPanX(newPanX);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  // Reset zoom on double tap
  const handleDoubleTap = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      setZoom(1);
      setPanX(0);
    }
  };

  return (
    <div className="relative touch-none">
      <svg 
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ 
          height: 'auto', 
          maxHeight: isMobile ? '350px' : '300px',
          minHeight: isMobile ? '280px' : 'auto'
        }}
        preserveAspectRatio="none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDoubleTap}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const relativeX = (mouseX / rect.width) * width;
          const dataRelativeX = (relativeX - padLeft) / (width - padLeft - pad);
          const dataIndex = Math.round(dataRelativeX * (validData.length - 1));
          
          if (dataIndex >= 0 && dataIndex < validData.length) {
            const point = validData[dataIndex];
            const pointX = x(xs[dataIndex]);
            const pointY = y(point.equity);
            
            // Only set hover point if coordinates are valid
            if (!isNaN(pointX) && !isNaN(pointY)) {
              setHoveredPoint({ x: pointX, y: pointY, point });
            }
          }
        }}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        {/* Background */}
        <rect x={0} y={0} width={width} height={height} fill="hsl(var(--muted) / 0.3)" />
        
        {/* X and Y Axes */}
        <line x1={padLeft} y1={height - padBottom} x2={width - pad} y2={height - padBottom} stroke="hsl(var(--border))" strokeWidth={1.5} />
        <line x1={padLeft} y1={pad} x2={padLeft} y2={height - padBottom} stroke="hsl(var(--border))" strokeWidth={1.5} />
        
        {/* Horizontal grid lines */}
        {yTickValues.map((value, i) => {
          const yPos = y(value);
          return (
            <line 
              key={`grid-${i}`}
              x1={padLeft} 
              y1={yPos} 
              x2={width - pad} 
              y2={yPos} 
              stroke="hsl(var(--border))" 
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}
        
        {/* Y-axis labels */}
        {yTickValues.map((value, i) => {
          const yPos = y(value);
          return (
              <text 
              key={`label-${i}`}
              x={padLeft - 8} 
              y={yPos} 
              textAnchor="end" 
              alignmentBaseline="middle" 
              className="fill-muted-foreground"
              style={{ fontSize: '11px' }}
            >
              {formatCurrency(value)}
            </text>
          );
        })}
        
        {/* X-axis labels */}
        {xTickIndices.map((idx) => {
          const point = validData[idx];
          const xPos = x(xs[idx]);
          return (
            <text 
              key={idx}
              x={xPos} 
              y={height - padBottom + 20} 
              textAnchor="middle" 
              className="fill-muted-foreground"
              style={{ fontSize: '11px' }}
            >
              {formatDate(point.date)}
            </text>
          );
        })}
        
        {/* Clipping for zoomed content */}
        <defs>
          <clipPath id="chart-clip">
            <rect x={padLeft} y={pad} width={width - padLeft - pad} height={height - pad - padBottom} />
          </clipPath>
        </defs>
        
        {/* Chart line with zoom/pan transform */}
        <g clipPath="url(#chart-clip)">
          <path 
            d={path} 
            fill="none" 
            stroke="currentColor" 
            strokeWidth={2}
            transform={`translate(${panX}, 0) scale(${zoom}, 1)`}
            style={{ transformOrigin: `${padLeft}px center` }}
          />
        </g>
        
        {hoveredPoint && !isNaN(hoveredPoint.x) && !isNaN(hoveredPoint.y) && (
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
          className="absolute bg-background border rounded-lg shadow-lg p-3 pointer-events-none z-10 whitespace-nowrap"
          style={{
            left: (() => {
              const relativeX = (hoveredPoint.x - padLeft) / (width - padLeft - pad);
              if (relativeX < 0.25) return `${relativeX * 100}%`; // Links im Chart → Tooltip nach rechts
              if (relativeX > 0.75) return `${relativeX * 100}%`; // Rechts im Chart → Tooltip nach links
              return `${relativeX * 100}%`; // Mitte → zentriert
            })(),
            top: `${Math.max(5, ((hoveredPoint.y - pad) / (height - pad - padBottom)) * 100 - 35)}%`,
            transform: (() => {
              const relativeX = (hoveredPoint.x - padLeft) / (width - padLeft - pad);
              if (relativeX < 0.25) return 'translateX(0)'; // Tooltip rechts vom Punkt
              if (relativeX > 0.75) return 'translateX(-100%)'; // Tooltip links vom Punkt
              return 'translateX(-50%)'; // Tooltip zentriert
            })()
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
