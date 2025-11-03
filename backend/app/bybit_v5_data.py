# app/bybit_v5_data.py
from __future__ import annotations
from typing import Optional, Dict, Any
from .bybit_v5 import BybitV5Client

class BybitV5Data:
    def __init__(self, api_key: str, api_secret: str, *, testnet: bool = False, recv_window: str = "10000", timeout: int = 20):
        self.client = BybitV5Client(api_key, api_secret, testnet=testnet, recv_window=recv_window, timeout=timeout)

    # --- Market ---
    # Docs: /v5/market/instruments-info
    # Supports: category (linear|inverse|option|spot), symbol, baseCoin, status, limit, cursor
    def instruments_info(self, *, category: str, symbol: Optional[str] = None,
                         baseCoin: Optional[str] = None, status: Optional[str] = None,
                         limit: Optional[int] = None, cursor: Optional[str] = None) -> Dict[str, Any]:
        q: Dict[str, Any] = {"category": category}
        if symbol:   q["symbol"]   = symbol       # z.B. ETHUSDT
        if baseCoin: q["baseCoin"] = baseCoin     # z.B. ETH
        if status:   q["status"]   = status       # Trading/PreLaunch/...
        if limit:    q["limit"]    = str(limit)
        if cursor:   q["cursor"]   = cursor
        return self.client._request("GET", "/v5/market/instruments-info", query=q)

    # --- Trade history (executions) ---
    # Docs: /v5/execution/list (Get Trade History)
    # Params: category, symbol?, baseCoin?, orderId?, orderLinkId?, startTime?, endTime?, limit?, cursor?
    def executions(self, *, category: str, symbol: Optional[str] = None, baseCoin: Optional[str] = None,
                   orderId: Optional[str] = None, orderLinkId: Optional[str] = None,
                   startTime: Optional[int] = None, endTime: Optional[int] = None,
                   limit: Optional[int] = 200, cursor: Optional[str] = None) -> Dict[str, Any]:
        q: Dict[str, Any] = {"category": category}
        if symbol:      q["symbol"]      = symbol
        if baseCoin:    q["baseCoin"]    = baseCoin
        if orderId:     q["orderId"]     = orderId
        if orderLinkId: q["orderLinkId"] = orderLinkId
        if startTime is not None: q["startTime"] = str(startTime)
        if endTime   is not None: q["endTime"]   = str(endTime)
        if limit:     q["limit"]     = str(limit)
        if cursor:    q["cursor"]    = cursor
        return self.client._request("GET", "/v5/execution/list", query=q)

    # --- Closed PnL ---
    # Docs: /v5/position/closed-pnl
    def closed_pnl(self, *, category: str, symbol: Optional[str] = None,
                   startTime: Optional[int] = None, endTime: Optional[int] = None,
                   limit: Optional[int] = 200, cursor: Optional[str] = None) -> Dict[str, Any]:
        q: Dict[str, Any] = {"category": category}
        if symbol:    q["symbol"]    = symbol
        if startTime is not None: q["startTime"] = str(startTime)
        if endTime   is not None: q["endTime"]   = str(endTime)
        if limit:     q["limit"]     = str(limit)
        if cursor:    q["cursor"]    = cursor
        return self.client._request("GET", "/v5/position/closed-pnl", query=q)

    # --- Account transaction log (incl. Funding, Fees, Cash flows) ---
    # Docs: /v5/account/transaction-log  (UTA 1.0/2.0)
    # Accepts: accountType(UNIFIED), category(linear/spot/...), currency, baseCoin, type, startTime, endTime, limit, cursor
    def transaction_log(self, *, accountType: Optional[str] = "UNIFIED", category: Optional[str] = None,
                        currency: Optional[str] = None, baseCoin: Optional[str] = None, type: Optional[str] = None,
                        startTime: Optional[int] = None, endTime: Optional[int] = None,
                        limit: Optional[int] = 50, cursor: Optional[str] = None) -> Dict[str, Any]:
        q: Dict[str, Any] = {}
        if accountType: q["accountType"] = accountType
        if category:    q["category"]    = category
        if currency:    q["currency"]    = currency
        if baseCoin:    q["baseCoin"]    = baseCoin
        if type:        q["type"]        = type
        if startTime is not None: q["startTime"] = str(startTime)
        if endTime   is not None: q["endTime"]   = str(endTime)
        if limit:     q["limit"]     = str(limit)  # Bybit default 20, max 50
        if cursor:    q["cursor"]    = cursor
        return self.client._request("GET", "/v5/account/transaction-log", query=q)
