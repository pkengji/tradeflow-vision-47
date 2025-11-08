import { Bitcoin, CircleDollarSign } from 'lucide-react';

interface CoinIconProps {
  symbol: string;
  className?: string;
}

export function CoinIcon({ symbol, className = "w-6 h-6" }: CoinIconProps) {
  // Remove USDT, USDC, BUSD suffixes to get base symbol
  const baseSymbol = symbol.replace(/(USDT|USDC|BUSD|USD)$/, '');
  
  // For now, use a simple icon mapping
  // In production, you could use a service like cryptocompare or coincap
  const iconUrl = `https://cryptoicons.org/api/icon/${baseSymbol.toLowerCase()}/50`;
  
  return (
    <img 
      src={iconUrl} 
      alt={baseSymbol}
      className={className}
      onError={(e) => {
        // Fallback to generic icon
        e.currentTarget.style.display = 'none';
        e.currentTarget.nextElementSibling?.classList.remove('hidden');
      }}
    />
  );
}

export function CoinIconFallback({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <div className={`${className} rounded-full bg-muted flex items-center justify-center hidden`}>
      <CircleDollarSign className="w-4 h-4" />
    </div>
  );
}
