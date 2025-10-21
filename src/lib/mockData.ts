// Mock-Daten für Tests und Entwicklung
import type { Bot, PositionListItem } from './api';

export const MOCK_BOTS: Bot[] = [
  {
    id: 1,
    name: 'Scalping Bot Alpha',
    strategy: 'EMA Crossover',
    timeframe: '5m',
    tv_risk_multiplier_default: 1.5,
    position_mode: 'hedge',
    margin_mode: 'isolated',
    default_leverage: 10,
    status: 'active',
    auto_approve: true,
    uuid: 'bot-alpha-uuid-123',
    secret: 'secret-alpha-456',
    max_leverage: 20,
    is_deleted: false,
    created_at: '2025-01-15T10:30:00Z',
    updated_at: '2025-01-20T14:22:00Z',
  },
  {
    id: 2,
    name: 'Swing Trading Bot Beta',
    strategy: 'Support/Resistance',
    timeframe: '1h',
    tv_risk_multiplier_default: 2.0,
    position_mode: 'one-way',
    margin_mode: 'cross',
    default_leverage: 5,
    status: 'active',
    auto_approve: false,
    uuid: 'bot-beta-uuid-789',
    secret: 'secret-beta-012',
    max_leverage: 15,
    is_deleted: false,
    created_at: '2025-01-10T08:15:00Z',
    updated_at: '2025-01-19T11:45:00Z',
  },
];

export const MOCK_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT',
  'MATICUSDT', 'AVAXUSDT', 'LINKUSDT', 'ATOMUSDT', 'UNIUSDT'
];

function randomSymbol() {
  return MOCK_SYMBOLS[Math.floor(Math.random() * MOCK_SYMBOLS.length)];
}

function randomSide(): 'long' | 'short' {
  return Math.random() > 0.5 ? 'long' : 'short';
}

function randomPrice(base: number) {
  return base * (0.9 + Math.random() * 0.2);
}

function randomDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return date.toISOString();
}

let mockIdCounter = 1;

export function generateMockOpenTrades(botId: number, botName: string, count: number): PositionListItem[] {
  const trades: PositionListItem[] = [];
  for (let i = 0; i < count; i++) {
    const symbol = randomSymbol();
    const side = randomSide();
    const entryPrice = randomPrice(50000);
    const currentPrice = randomPrice(entryPrice);
    const qty = 0.001 + Math.random() * 0.05;
    const pnl = (currentPrice - entryPrice) * qty * (side === 'long' ? 1 : -1);
    
    const slDistance = entryPrice * 0.02;
    const tpDistance = entryPrice * 0.05;
    
    trades.push({
      id: mockIdCounter++,
      symbol,
      side,
      status: 'open',
      entry_price: entryPrice,
      qty,
      bot_name: botName,
      opened_at: randomDate(Math.floor(Math.random() * 3)),
      closed_at: null,
      pnl,
      sl: side === 'long' ? entryPrice - slDistance : entryPrice + slDistance,
      tp: side === 'long' ? entryPrice + tpDistance : entryPrice - tpDistance,
      exit_price: null,
    });
  }
  return trades;
}

export function generateMockClosedTrades(botId: number, botName: string, count: number): PositionListItem[] {
  const trades: PositionListItem[] = [];
  for (let i = 0; i < count; i++) {
    const symbol = randomSymbol();
    const side = randomSide();
    const entryPrice = randomPrice(50000);
    const exitPrice = randomPrice(entryPrice);
    const qty = 0.001 + Math.random() * 0.05;
    const pnl = (exitPrice - entryPrice) * qty * (side === 'long' ? 1 : -1);
    
    const slDistance = entryPrice * 0.02;
    const tpDistance = entryPrice * 0.05;
    const openedDaysAgo = 3 + Math.floor(Math.random() * 7);
    
    trades.push({
      id: mockIdCounter++,
      symbol,
      side,
      status: 'closed',
      entry_price: entryPrice,
      qty,
      bot_name: botName,
      opened_at: randomDate(openedDaysAgo),
      closed_at: randomDate(openedDaysAgo - 1),
      pnl,
      sl: side === 'long' ? entryPrice - slDistance : entryPrice + slDistance,
      tp: side === 'long' ? entryPrice + tpDistance : entryPrice - tpDistance,
      exit_price: exitPrice,
    });
  }
  return trades;
}

export function generateAllMockTrades(): PositionListItem[] {
  const allTrades: PositionListItem[] = [];
  
  // 5 offene Trades pro Bot
  allTrades.push(...generateMockOpenTrades(1, MOCK_BOTS[0].name, 5));
  allTrades.push(...generateMockOpenTrades(2, MOCK_BOTS[1].name, 5));
  
  // 10 geschlossene Trades pro Bot
  allTrades.push(...generateMockClosedTrades(1, MOCK_BOTS[0].name, 10));
  allTrades.push(...generateMockClosedTrades(2, MOCK_BOTS[1].name, 10));
  
  return allTrades;
}

// Mock Position Details
export function generateMockPositionDetail(positionId: number) {
  const trade = generateAllMockTrades().find(t => t.id === positionId) || generateMockOpenTrades(1, 'Test Bot', 1)[0];
  
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    entry_price: trade.entry_price,
    exit_price: trade.exit_price,
    qty: trade.qty,
    tv_qty: trade.qty,
    bot_name: trade.bot_name,
    bot_id: Math.floor(Math.random() * 2) + 1,
    opened_at: trade.opened_at,
    closed_at: trade.closed_at,
    pnl: trade.pnl,
    realized_pnl_net_usdt: trade.pnl,
    sl: trade.sl,
    sl_trigger: trade.sl,
    tp: trade.tp,
    tp_trigger: trade.tp,
    mark_price: trade.status === 'open' ? (trade.entry_price || 0) * (0.98 + Math.random() * 0.04) : null,
    
    // Zusätzliche Details für das Modal
    trade_id: `TRD-${String(positionId).padStart(6, '0')}`,
    trigger_price: (trade.entry_price || 0) * (0.995 + Math.random() * 0.01),
    position_size_usdt: (trade.qty || 0) * (trade.entry_price || 0),
    leverage_size: Math.floor(Math.random() * 10) + 5,
    leverage_type: ['isolated', 'cross'][Math.floor(Math.random() * 2)],
    
    // Transaktionskosten
    fee_open_usdt: ((trade.qty || 0) * (trade.entry_price || 0)) * 0.0004,
    fee_close_usdt: trade.status === 'closed' ? ((trade.qty || 0) * (trade.exit_price || 0)) * 0.0004 : null,
    slippage_liquidity_open: Math.random() * 2,
    slippage_liquidity_close: trade.status === 'closed' ? Math.random() * 2 : null,
    slippage_timelag: Math.random() * 5,
    
    // Timelag Daten (in ms)
    timelag_tv_to_bot: Math.floor(Math.random() * 100) + 50,
    timelag_bot_processing: Math.floor(Math.random() * 50) + 20,
    timelag_bot_to_exchange: Math.floor(Math.random() * 200) + 100,
    timelag_close_tv_to_bot: trade.status === 'closed' ? Math.floor(Math.random() * 100) + 50 : null,
    timelag_close_bot_processing: trade.status === 'closed' ? Math.floor(Math.random() * 50) + 20 : null,
    timelag_close_bot_to_exchange: trade.status === 'closed' ? Math.floor(Math.random() * 200) + 100 : null,
  };
}

export function generateMockOrders(positionId: number) {
  return [
    {
      id: 1,
      position_id: positionId,
      order_type: 'market',
      side: 'buy',
      qty: 0.025,
      price: null,
      status: 'filled',
      created_at: randomDate(2),
    },
    {
      id: 2,
      position_id: positionId,
      order_type: 'stop_loss',
      side: 'sell',
      qty: 0.025,
      price: 48500,
      status: 'active',
      created_at: randomDate(2),
    },
  ];
}

export function generateMockFunding(positionId: number) {
  return [
    {
      id: 1,
      position_id: positionId,
      funding_rate: 0.0001,
      amount_usdt: -0.15,
      timestamp: randomDate(1),
    },
    {
      id: 2,
      position_id: positionId,
      funding_rate: 0.00015,
      amount_usdt: -0.22,
      timestamp: randomDate(0),
    },
  ];
}
