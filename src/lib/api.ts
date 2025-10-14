import { AuthResponse, Bot, Position, Order, FundingRecord, SignalLog, Symbol, KPIData, PositionsResponse, BotSymbolSetting } from '@/types/api';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Mock mode for development without backend
const MOCK_MODE = true;

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (MOCK_MODE) {
      return this.mockRequest<T>(endpoint, options);
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  private async mockRequest<T>(endpoint: string, options: RequestInit): Promise<T> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock responses
    if (endpoint === '/auth/login') {
      return {
        accessToken: 'mock_token_123',
        refreshToken: 'mock_refresh_456',
        user: {
          id: '1',
          email: 'trader@example.com',
          name: 'Demo Trader',
          role: 'admin',
        },
      } as T;
    }

    if (endpoint === '/bots') {
      return [
        {
          id: 1,
          name: 'Scalper Bot',
          description: 'High frequency scalping strategy',
          exchange: 'bybit',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 2,
          name: 'Swing Bot',
          description: 'Medium-term swing trading',
          exchange: 'binance',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as T;
    }

    if (endpoint.startsWith('/positions')) {
      const mockPositions: Position[] = [
        {
          id: 1,
          botId: 1,
          symbol: 'BTCUSDT',
          side: 'long',
          qty: 0.5,
          entrySignalPrice: 42000,
          entryFillPrice: 42015,
          tp: 43000,
          sl: 41500,
          status: 'open',
          openedAt: new Date(Date.now() - 3600000).toISOString(),
          pnl: 250.50,
          pnlPct: 0.6,
          tradingFees: 12.60,
          fundingFees: -2.30,
          slippagePct: 0.036,
          timelagMs: 145,
        },
        {
          id: 2,
          botId: 1,
          symbol: 'ETHUSDT',
          side: 'short',
          qty: 2.0,
          entrySignalPrice: 2300,
          entryFillPrice: 2298,
          tp: 2250,
          sl: 2320,
          status: 'closed',
          openedAt: new Date(Date.now() - 7200000).toISOString(),
          closedAt: new Date(Date.now() - 1800000).toISOString(),
          pnl: -45.20,
          pnlPct: -0.98,
          tradingFees: 9.20,
          fundingFees: -1.80,
          slippagePct: 0.087,
          timelagMs: 230,
        },
      ];

      if (endpoint.includes('/positions/')) {
        const id = parseInt(endpoint.split('/')[2]);
        return mockPositions.find(p => p.id === id) as T;
      }

      return {
        positions: mockPositions,
        total: mockPositions.length,
      } as T;
    }

    if (endpoint.startsWith('/symbols')) {
      return [
        { symbol: 'BTCUSDT', tickSize: 0.01, stepSize: 0.001 },
        { symbol: 'ETHUSDT', tickSize: 0.01, stepSize: 0.001 },
        { symbol: 'XRPUSDT', tickSize: 0.0001, stepSize: 0.1 },
      ] as T;
    }

    return {} as T;
  }

  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<void> {
    this.clearToken();
  }

  // Bots
  async getBots(): Promise<Bot[]> {
    return this.request<Bot[]>('/bots');
  }

  async getBotSymbolSettings(botId: number): Promise<BotSymbolSetting[]> {
    return this.request<BotSymbolSetting[]>(`/bots/${botId}/symbols`);
  }

  // Positions
  async getPositions(params?: {
    status?: string;
    botId?: number;
    symbol?: string;
  }): Promise<PositionsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.botId) query.append('bot_id', params.botId.toString());
    if (params?.symbol) query.append('symbol', params.symbol);

    return this.request<PositionsResponse>(`/positions?${query.toString()}`);
  }

  async getPosition(id: number): Promise<Position> {
    return this.request<Position>(`/positions/${id}`);
  }

  // Orders
  async getOrders(positionId: number): Promise<Order[]> {
    return this.request<Order[]>(`/orders?position_id=${positionId}`);
  }

  // Funding
  async getFunding(positionId: number): Promise<FundingRecord[]> {
    return this.request<FundingRecord[]>(`/funding?position_id=${positionId}`);
  }

  // Symbols
  async getSymbols(): Promise<Symbol[]> {
    return this.request<Symbol[]>('/symbols');
  }
}

export const api = new ApiClient();
