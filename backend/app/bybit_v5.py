# app/bybit_v5.py
import time
import hmac
import hashlib
import json
import requests
from typing import Optional, Dict, Any, List, Tuple, Callable
import websocket
from websocket import create_connection, WebSocketTimeoutException,  WebSocketConnectionClosedException
import threading
from .database import SessionLocal
from . import models
from app.services.pnl import compute_pnl


# ============================================================
# REST-Client (deine vorhandene Logik, nur minimal erweitert)
# ============================================================

class BybitV5Client:
    """
    Minimaler v5-Client mit korrekter Signatur:
    - GET: sign(timestamp + apiKey + recvWindow + sorted_querystring)
    - POST: sign(timestamp + apiKey + recvWindow + compact_json_body)
    """
    def __init__(self, api_key: str, api_secret: str, *, testnet: bool = False, recv_window: str = "10000", timeout: int = 20):
        self.api_key = api_key
        self.api_secret = api_secret
        self.recv_window = recv_window
        self.timeout = timeout
        self.base = "https://api-testnet.bybit.com" if testnet else "https://api.bybit.com"

        # Zeit-Offset zur Bybit-Serverzeit (in ms)
        self.time_offset_ms = 0

    @staticmethod
    def _compact_json(d: Dict[str, Any]) -> str:
        return json.dumps(d or {}, separators=(",", ":"))

    def _ts(self) -> str:
        # Lokale Zeit + ggf. korrigierter Offset zur Bybit-Serverzeit
        now_ms = int(time.time() * 1000)
        return str(now_ms + getattr(self, "time_offset_ms", 0))
    
    def _sync_time(self) -> None:
        """
        Holt die aktuelle Serverzeit von Bybit und berechnet einen Offset
        zur lokalen Systemzeit, um Timestamp-Fehler (10002) zu vermeiden.
        """
        try:
            url = f"{self.base}/v5/market/time"
            r = requests.get(url, timeout=self.timeout)
            r.raise_for_status()
            data = r.json()

            server_ms = None

            # Bybit v5 liefert typischerweise:
            # { "retCode":0, "time": 1710000000000, "result": { "timeNano": "...", ... } }
            if isinstance(data, dict):
                if "time" in data:
                    t = data["time"]
                    # kann sec oder ms sein
                    ts = int(str(t))
                    server_ms = ts if ts > 10**12 else ts * 1000
                elif "result" in data and isinstance(data["result"], dict):
                    res = data["result"]
                    if "timeNano" in res:
                        server_ms = int(int(res["timeNano"]) / 1_000_000)
                    elif "timeSecond" in res:
                        server_ms = int(res["timeSecond"]) * 1000

            if server_ms is not None:
                local_ms = int(time.time() * 1000)
                self.time_offset_ms = server_ms - local_ms
            # wenn parsing fehlschlägt → Offset bleibt 0
        except Exception:
            # Fehler beim Sync ignorieren – wir versuchen es dann beim nächsten 10002 wieder
            pass

    def _sign(self, msg: str) -> str:
        return hmac.new(self.api_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

    def _build_sorted_pairs(self, params: Dict[str, Any]) -> List[Tuple[str, str]]:
        clean = {k: str(v) for k, v in (params or {}).items() if v is not None}
        return [(k, clean[k]) for k in sorted(clean)]

    def _signed_get_headers_from_pairs(self, pairs: List[Tuple[str, str]]) -> Dict[str, str]:
        qs = "&".join(f"{k}={v}" for k, v in pairs)
        ts = self._ts()
        sig = self._sign(f"{ts}{self.api_key}{self.recv_window}{qs}")
        return {
            "X-BAPI-API-KEY": self.api_key,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": self.recv_window,
            "X-BAPI-SIGN": sig,
            "X-BAPI-SIGN-TYPE": "2",
        }

    def _signed_post_headers(self, body: Dict[str, Any]) -> Dict[str, str]:
        body_str = self._compact_json(body or {})
        ts = self._ts()
        sig = self._sign(f"{ts}{self.api_key}{self.recv_window}{body_str}")
        return {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": self.api_key,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": self.recv_window,
            "X-BAPI-SIGN": sig,
        }

    def _request(self, method: str, path: str, *, query: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None, _retry: bool = False) -> Dict[str, Any]:
        url = f"{self.base}{path}"
        method = method.upper()

        if method == "GET":
            pairs = self._build_sorted_pairs(query or {})
            headers = self._signed_get_headers_from_pairs(pairs)
            qs = "&".join(f"{k}={v}" for k, v in pairs)
            full_url = f"{url}?{qs}" if qs else url
            r = requests.get(full_url, headers=headers, timeout=self.timeout)
        elif method == "POST":
            payload = body or {}
            headers = self._signed_post_headers(payload)
            r = requests.post(url, headers=headers, data=self._compact_json(payload), timeout=self.timeout)
        else:
            raise ValueError("Unsupported HTTP method")

        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("retCode") not in (0, "0", None):
            code = data.get("retCode")
            msg = data.get("retMsg", "Bybit error")

            # Spezieller Fall: Timestamp-/recv_window-Fehler 10002 → einmal Zeit synchronisieren & retry
            if str(code) == "10002" and not _retry:
                self._sync_time()
                # erneuter Versuch mit korrigiertem Timestamp
                return self._request(method, path, query=query, body=body, _retry=True)

            raise requests.HTTPError(f"Bybit API error {code}: {msg}", response=r)
        return data


# ============================================================
# Kleine REST-Hülle, damit main.py nicht umgeschrieben werden muss
# ============================================================

class BybitRest:
    """
    Sehr kleine Hülle um /v5/order/create, damit wir im Backend nur
    BybitRest(...).place_order(...) aufrufen müssen.
    """
    def __init__(self, base_url: str = "https://api.bybit.com"):
        self.base_url = base_url.rstrip("/")

    def _sign(self, api_secret: str, msg: str) -> str:
        return hmac.new(api_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

    def place_order(self, api_key: str, api_secret: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        path = "/v5/order/create"
        url = self.base_url + path
        ts = str(int(time.time() * 1000))
        recv_window = "5000"
        body = json.dumps(payload, separators=(",", ":"))
        sign_msg = ts + api_key + recv_window + body
        sign = self._sign(api_secret, sign_msg)

        headers = {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-SIGN": sign,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }
        
        resp = requests.post(url, headers=headers, data=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        # Bybit: retCode 0 = OK
        if isinstance(data, dict) and str(data.get("retCode", "0")) not in ("0", 0):
            raise requests.HTTPError(f"Bybit error {data.get('retCode')}: {data.get('retMsg')}", response=resp)
        return data
    
    def set_leverage(
        self,
        api_key: str,
        api_secret: str,
        category: str,
        symbol: str,
        buy_leverage: float,
        sell_leverage: float,
    ) -> Dict[str, Any]:
        """
        /v5/position/set-leverage – Leverage pro Symbol setzen.
        category: "linear" für USDT Perps
        """
        path = "/v5/position/set-leverage"
        url = self.base_url + path
        ts = str(int(time.time() * 1000))
        recv_window = "5000"

        body_dict = {
            "category": category,
            "symbol": symbol,
            "buyLeverage": str(buy_leverage),
            "sellLeverage": str(sell_leverage),
        }
        body = json.dumps(body_dict, separators=(",", ":"))
        sign_msg = ts + api_key + recv_window + body
        sign = self._sign(api_secret, sign_msg)

        headers = {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-SIGN": sign,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }

        resp = requests.post(url, headers=headers, data=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and str(data.get("retCode", "0")) not in ("0", 0):
            raise requests.HTTPError(
                f"Bybit error {data.get('retCode')}: {data.get('retMsg')}", response=resp
            )
        return data

    def cancel_all_orders(self, api_key: str, api_secret: str, category: str, symbol: str) -> Dict[str, Any]:
        """
        Cancel ALL offenen Orders (active + conditional) für ein Symbol in einer Kategorie.
        Wird genutzt, um vor/bei Close alles frei zu räumen.
        """
        path = "/v5/order/cancel-all"
        url = self.base_url + path
        ts = str(int(time.time() * 1000))
        recv_window = "5000"
        body_dict = {"category": category, "symbol": symbol}
        body = json.dumps(body_dict, separators=(",", ":"))
        sign_msg = ts + api_key + recv_window + body
        sign = self._sign(api_secret, sign_msg)

        headers = {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-SIGN": sign,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }

        resp = requests.post(url, headers=headers, data=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and str(data.get("retCode", "0")) not in ("0", 0):
            raise requests.HTTPError(f"Bybit error {data.get('retCode')}: {data.get('retMsg')}", response=resp)
        return data

    def set_trading_stop(self, api_key: str, api_secret: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Wrapper für /v5/position/trading-stop (TP/SL an bestehender Position anpassen).
        """
        path = "/v5/position/trading-stop"
        url = self.base_url + path
        ts = str(int(time.time() * 1000))
        recv_window = "5000"
        body = json.dumps(payload, separators=(",", ":"))
        sign_msg = ts + api_key + recv_window + body
        sign = self._sign(api_secret, sign_msg)

        headers = {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-SIGN": sign,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }

        resp = requests.post(url, headers=headers, data=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and str(data.get("retCode", "0")) not in ("0", 0):
            raise requests.HTTPError(f"Bybit error {data.get('retCode')}: {data.get('retMsg')}", response=resp)
        return data

# ============================================================
# WebSocket-Client für privateExecution.v5 + position
# ============================================================

class BybitWS:
    """
    Einfacher WS-Client für Bybit V5 Private:
    - verbindet zu wss://stream.bybit.com/v5/private (oder Testnet)
    - authentifiziert
    - subscribed auf "position" und "execution"
    - ruft Callbacks auf: on_exec(row, ctx), on_position(row, ctx)
    """

    def __init__(
        self,
        ws_url: str,
        api_key: str,
        api_secret: str,
        on_exec: Callable[[Dict[str, Any], Dict[str, Any]], None],
        on_position: Callable[[Dict[str, Any], Dict[str, Any]], None],
        ctx: Dict[str, Any],
        timeout: int = 30,  # 30s ist in der Praxis meist ausreichend
    ):
        self.ws_url = ws_url
        self.api_key = api_key
        self.api_secret = api_secret
        self.on_exec = on_exec
        self.on_position = on_position
        self.ctx = ctx

        self.ws: Optional[websocket.WebSocket] = None
        self._stop = False
        self._thread: Optional[threading.Thread] = None
        self.timeout = timeout

    # ---------- helper ----------

    def _sign(self, msg: str) -> str:
        return hmac.new(
            self.api_secret.encode("utf-8"),
            msg.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _auth_msg(self) -> Dict[str, Any]:
        # Bybit-Doku: GET/realtime + expires
        expires = int((time.time() + 60) * 1000)
        to_sign = f"GET/realtime{expires}"
        sig = self._sign(to_sign)
        return {
            "op": "auth",
            "args": [self.api_key, expires, sig],
        }

    def _sub_msg(self) -> Dict[str, Any]:
        # V5-Private-Topics "position" und "execution"
        return {
            "op": "subscribe",
            "args": ["position", "execution"],
        }

    # ---------- main loop ----------

    def _run(self):
        bot_id = self.ctx.get("bot_id")
        while not self._stop:
            try:
                print(f"[WS] Connecting to {self.ws_url} for bot {bot_id}")
                self.ws = create_connection(self.ws_url, timeout=self.timeout)
                print(f"[WS] Connected to {self.ws_url} for bot {bot_id}")

                # Recv-Timeout explizit setzen
                self.ws.settimeout(self.timeout)

                # Auth
                auth_msg = self._auth_msg()
                print(f"[WS] Sending auth for bot {bot_id}")
                self.ws.send(json.dumps(auth_msg))

                # Subscribe
                sub_msg = self._sub_msg()
                print(f"[WS] Subscribing for bot {bot_id}: {sub_msg}")
                self.ws.send(json.dumps(sub_msg))

                last_ping = time.time()

                while not self._stop:
                    # Ping alle 20s
                    if time.time() - last_ping >= 20:
                        try:
                            self.ws.send(json.dumps({"op": "ping"}))
                            # optional: print(f"[WS] ping sent for bot {bot_id}")
                        except Exception as e:
                            print(f"[WS] ping failed for bot {bot_id}: {e}")
                            break
                        last_ping = time.time()

                    try:
                        msg = self.ws.recv()
                    except WebSocketTimeoutException:
                        # Kein Frame im Timeout-Fenster -> einfach weiter warten
                        continue
                    except WebSocketConnectionClosedException as e:
                        print(f"[WS] connection closed for bot {bot_id}: {e}")
                        break
                    except Exception as e:
                        print(f"[WS] recv error for bot {bot_id}: {e}")
                        break

                    if not msg:
                        print(f"[WS] empty message for bot {bot_id}, closing loop")
                        break

                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        print(f"[WS] Non-JSON message for bot {bot_id}: {msg}")
                        continue

                    topic = (data.get("topic") or "").lower()

                    if topic:
                        rows = data.get("data") or []
                        print(f"[WS DATA] bot {bot_id} topic={topic} rows={len(rows)}")
                    
                    # Kontroll-Nachrichten (auth/sub/ping-pong)
                    if not topic:
                        print(f"[WS CONTROL] bot {bot_id}: {data}")
                        continue

                    # Execution-Events
                    if "execution" in topic:
                        rows = data.get("data") or []
                        for row in rows:
                            try:
                                self.on_exec(row, self.ctx)
                            except Exception as e:
                                print(f"[WS on_exec error bot {bot_id}]: {e}")

                    # Positions-Events (für mark_price / PnL)
                    if "position" in topic:
                        rows = data.get("data") or []
                        for row in rows:
                            try:
                                self.on_position(row, self.ctx)
                            except Exception as e:
                                print(f"[WS on_position error bot {bot_id}]: {e}")

            except Exception as e:
                print(f"[WS] Error in WS loop for bot {bot_id}: {e}")
                time.sleep(3)
            finally:
                try:
                    if self.ws:
                        self.ws.close()
                except Exception:
                    pass
                self.ws = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop = True
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass


# ============================================================
# WebSocket-Client für public data (aktueller Mark-Price + unrealized PnL)
# ============================================================

class BybitPublicWS:
    """
    Einfacher WS-Client für Bybit V5 Public:
    - verbindet zu wss://stream.bybit.com/v5/public/linear (oder Testnet-URL)
    - subscribed auf "tickers.<SYMBOL>" für eine Liste von Symbolen
    - ruft Callback on_ticker(row, ctx) auf
    """

    def __init__(
        self,
        ws_url: str,
        symbols: List[str],
        on_ticker: Callable[[Dict[str, Any], Dict[str, Any]], None],
        ctx: Dict[str, Any],
        timeout: int = 30,
    ):
        self.ws_url = ws_url
        # Symbole wie "BTCUSDT", "ETHUSDT.P" etc.
        self.symbols = [s.upper() for s in symbols]
        self.on_ticker = on_ticker
        self.ctx = ctx

        self.ws: Optional[websocket.WebSocket] = None
        self._stop = False
        self._thread: Optional[threading.Thread] = None
        self.timeout = timeout

    def _sub_msg(self) -> Dict[str, Any]:
        # Bybit V5 Public Topic: tickers.<symbol>
        args = [f"tickers.{s}" for s in self.symbols]
        return {
            "op": "subscribe",
            "args": args,
        }

    def _run(self):
        while not self._stop:
            try:
                print(f"[WS PUBLIC] Connecting to {self.ws_url} (symbols={len(self.symbols)})")
                self.ws = create_connection(self.ws_url, timeout=self.timeout)
                print(f"[WS PUBLIC] Connected to {self.ws_url}")

                # Recv-Timeout setzen
                self.ws.settimeout(self.timeout)

                # Subscribe
                sub_msg = self._sub_msg()
                print(f"[WS PUBLIC] Subscribing: {sub_msg}")
                self.ws.send(json.dumps(sub_msg))

                last_ping = time.time()

                while not self._stop:
                    # Ping alle 20s (Public WS versteht ping/pong ebenso)
                    if time.time() - last_ping >= 20:
                        try:
                            self.ws.send(json.dumps({"op": "ping"}))
                        except Exception as e:
                            print(f"[WS PUBLIC] ping failed: {e}")
                            break
                        last_ping = time.time()

                    try:
                        msg = self.ws.recv()
                    except WebSocketTimeoutException:
                        # Kein Frame im Timeout-Fenster -> weiter warten
                        continue
                    except WebSocketConnectionClosedException as e:
                        print(f"[WS PUBLIC] connection closed: {e}")
                        break
                    except Exception as e:
                        print(f"[WS PUBLIC] recv error: {e}")
                        break

                    if not msg:
                        print("[WS PUBLIC] empty message, closing loop")
                        break

                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        print(f"[WS PUBLIC] Non-JSON message: {msg}")
                        continue

                    topic = (data.get("topic") or "").lower()

                    # Control-Messages (subscribe response, ping/pong)
                    if not topic:
                        # z.B. {"op":"subscribe","success":true,...} oder {"op":"pong",...}
                        # optional: print(f"[WS PUBLIC CONTROL]: {data}")
                        continue

                    if topic.startswith("tickers."):
                        data_field = data.get("data")

                        # Bybit-Ticker: data ist i.d.R. ein Objekt (dict), kein Array
                        if isinstance(data_field, dict):
                            rows = [data_field]
                        elif isinstance(data_field, list):
                            rows = data_field
                        else:
                            rows = []

                        for row in rows:
                            try:
                                self.on_ticker(row, self.ctx)
                            except Exception as e:
                                print(f"[WS PUBLIC on_ticker error]: {e}")

            except Exception as e:
                print(f"[WS PUBLIC] Error in WS loop: {e}")
                time.sleep(3)
            finally:
                try:
                    if self.ws:
                        self.ws.close()
                except Exception:
                    pass
                self.ws = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop = True
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass

