# app/bybit_v5.py
import time
import hmac
import hashlib
import json
import requests
from typing import Optional, Dict, Any, List, Tuple, Callable
import websocket
from websocket import create_connection, WebSocketConnectionClosedException
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

    @staticmethod
    def _compact_json(d: Dict[str, Any]) -> str:
        return json.dumps(d or {}, separators=(",", ":"))

    def _ts(self) -> str:
        return str(int(time.time() * 1000))

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

    def _request(self, method: str, path: str, *, query: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
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


# ============================================================
# WebSocket-Client für privateExecution.v5 + position
# ============================================================

class BybitWS:
    """
    Sehr einfacher WS-Client:
    - verbindet zu wss://stream.bybit.com/v5/private (oder Testnet)
    - authentifiziert
    - subscribed auf privateExecution.v5 und position
    - ruft die Callbacks auf: on_exec(row, ctx), on_position(row, ctx)
    """

    def __init__(
        self,
        ws_url: str,
        api_key: str,
        api_secret: str,
        on_exec: Callable[[Dict[str, Any], Dict[str, Any]], None],
        on_position: Callable[[Dict[str, Any], Dict[str, Any]], None],
        ctx: Dict[str, Any],
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

    # ---------- helper ----------

    def _sign(self, msg: str) -> str:
        return hmac.new(self.api_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

    def _auth_msg(self) -> Dict[str, Any]:
        # Bybit WS v5 Auth
        expires = int(time.time() * 1000) + 60_000
        to_sign = f"GET/realtime{expires}"
        sig = self._sign(to_sign)
        return {
            "op": "auth",
            "args": [self.api_key, expires, sig],
        }

    def _sub_msg(self) -> Dict[str, Any]:
        return {
            "op": "subscribe",
            "args": ["privateExecution.v5", "position"],
        }

    # ---------- main loop ----------

    def _run(self):
        while not self._stop:
            try:
                self.ws = create_connection(self.ws_url, timeout=10)
                # auth
                self.ws.send(json.dumps(self._auth_msg()))
                # subscribe
                self.ws.send(json.dumps(self._sub_msg()))

                last_ping = time.time()
                while not self._stop:
                    # keep-alive alle 20s
                    if time.time() - last_ping >= 20:
                        try:
                            self.ws.send(json.dumps({"op": "ping"}))
                        except Exception:
                            break
                        last_ping = time.time()

                    msg = self.ws.recv()
                    if not msg:
                        break
                    data = json.loads(msg)
                    topic = data.get("topic") or ""
                    # executions
                    if "execution" in topic.lower():
                        for row in data.get("data", []):
                            try:
                                self.on_exec(row, self.ctx)
                            except Exception:
                                pass
                    # positions
                    if "position" in topic.lower():
                        for row in data.get("data", []):
                            try:
                                self.on_position(row, self.ctx)
                            except Exception:
                                pass
            except Exception:
                time.sleep(3)
            finally:
                try:
                    if self.ws:
                        self.ws.close()
                except Exception:
                    pass

    # ---------- public API ----------

    def start(self):
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


    
