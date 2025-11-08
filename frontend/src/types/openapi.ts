// Auto-generated from OpenAPI spec
export interface components {
  schemas: {
    BotOut: {
      id: number;
      name: string;
      strategy: string;
      timeframe: string;
      tv_risk_multiplier_default: number;
    };
    BotSymbolSettingOut: {
      id: number;
      bot_id: number;
      symbol: string;
      enabled: boolean;
      target_risk_amount: number;
      leverage_override: number | null;
    };
    DailyPnlPoint: {
      day: string;
      pnl_net_usdt: number;
    };
    ExecutionOut: {
      id: number;
      price: number;
      qty: number;
      fee_usdt: number;
      liquidity: string | null;
      ts: string;
    };
    FundingEventOut: {
      symbol: string;
      amount_usdt: number;
      rate: number;
      ts: string;
    };
    OrderOut: {
      id: number;
      type: string;
      order_type: string;
      side: string;
      price_after_fee: number;
      trigger_price: number | null;
      qty: number;
      status: string;
      created_at: string;
      filled_at: string | null;
      executions: ExecutionOut[];
    };
    PositionOut: {
      id: number;
      symbol: string;
      side: string;
      tv_risk_amount: number | null;
      tv_qty: number | null;
      tv_qty_type: string | null;
      risk_amount: number;
      qty: number;
      qty_type: string;
      entry_price: number;
      exit_price: number | null;
      entry_fee_total_usdt: number;
      exit_fee_total_usdt: number | null;
      funding_total_usdt: number;
      sl_trigger: number;
      sl_limit: number;
      backup_sl: number;
      tp_trigger: number;
      rr: number;
      leverage: number;
      margin_mode: string;
      isolated_margin_at_entry: number | null;
      opened_at: string;
      closed_at: string | null;
      status: string;
      realized_pnl_net_usdt: number | null;
    };
    PositionsResponse: {
      items: PositionOut[];
    };
    SymbolOut: {
      symbol: string;
      tick_size: number;
      step_size: number;
      base_currency: string;
      quote_currency: string;
    };
  };
}

export type BotOut = components['schemas']['BotOut'];
export type PositionOut = components['schemas']['PositionOut'];
export type PositionsResponse = components['schemas']['PositionsResponse'];
export type OrderOut = components['schemas']['OrderOut'];
export type ExecutionOut = components['schemas']['ExecutionOut'];
export type FundingEventOut = components['schemas']['FundingEventOut'];
export type DailyPnlPoint = components['schemas']['DailyPnlPoint'];
export type SymbolOut = components['schemas']['SymbolOut'];
