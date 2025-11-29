import { CircleDollarSign } from 'lucide-react';

interface CoinIconProps {
  symbol: string;
  iconUrl?: string | null;
  className?: string;
}

export function CoinIcon({ symbol, iconUrl, className = "w-6 h-6" }: CoinIconProps) {
  const baseSymbol = symbol.replace(/(USDT|USDC|BUSD|USD)$/, '');
  
  if (!iconUrl) {
    return (
      <div className={`${className} rounded-full bg-muted flex items-center justify-center`}>
        <span className="text-xs font-medium">{baseSymbol.slice(0, 2)}</span>
      </div>
    );
  }
  
  return (
    <img 
      src={iconUrl} 
      alt={baseSymbol}
      className={className}
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.className = `${className} rounded-full bg-muted flex items-center justify-center`;
        fallback.innerHTML = `<span class="text-xs font-medium">${baseSymbol.slice(0, 2)}</span>`;
        target.parentNode?.insertBefore(fallback, target);
      }}
    />
  );
}

export function CoinIconFallback({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <div className={`${className} rounded-full bg-muted flex items-center justify-center`}>
      <CircleDollarSign className="w-4 h-4" />
    </div>
  );
}
