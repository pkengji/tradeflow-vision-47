# app/services/notifications.py
import os, json, shutil, psutil, time
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from pywebpush import webpush, WebPushException
from app import models

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY  = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS      = {"sub": os.getenv("VAPID_SUB", "mailto:admin@example.com")}

def send_webpush(subscription: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        # Logge sauber, aber wirf keinen Fehler
        print("[WEBPUSH] VAPID keys missing")
        return False
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS,
        )
        return True
    except WebPushException as e:
        print(f"[WEBPUSH] Failed: {e}")
        return False

def notify_user_push(db: Session, user_id: int, title: str, body: str, data: Dict[str, Any] | None = None):
    subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all()
    payload = {"title": title, "body": body, "data": (data or {}), "ts": datetime.now(timezone.utc).isoformat()}
    for s in subs:
        send_webpush(
            subscription={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
            payload=payload,
        )

# --- Optionale Komfort-Wrapper (für E) ---
def notify_trade_opened(db: Session, user_id: int, position_id: int):
    notify_user_push(db, user_id, "Trade opened", f"Position #{position_id} opened.", {"position_id": position_id})

def notify_trade_closed(db: Session, user_id: int, position_id: int, won: bool):
    notify_user_push(db, user_id, "Trade closed", f"Position #{position_id} {'WON' if won else 'LOST'}.", {"position_id": position_id, "won": won})

def notify_trade_failed(db: Session, user_id: int, outbox_id: int, reason: str):
    notify_user_push(db, user_id, "Trade failed", reason, {"outbox_id": outbox_id})

def notify_sltp_changed(db: Session, user_id: int, position_id: int):
    notify_user_push(db, user_id, "SL/TP updated", f"Position #{position_id} SL/TP changed.", {"position_id": position_id})

# --- Für F) (Admins) ---
def _admin_ids_from_env() -> list[int]:
    raw = os.getenv("ADMIN_USER_IDS", "")
    return [int(x) for x in raw.split(",") if x.strip().isdigit()]

def notify_system_health_alert(db: Session, message: str, meta: Dict[str, Any] | None = None):
    for admin_id in _admin_ids_from_env():
        notify_user_push(db, admin_id, "System alert", message, meta or {})



# ==============================
# Health-Checker
# ==============================


SYNC_MAX_DELAY_MIN = int(os.getenv("SYNC_MAX_DELAY_MIN", "30"))

def last_sync_ok(db: Session) -> bool:
    # Beispiel: lies last_sync_at aus deiner Status-Tabelle (oder Logs)
    row = db.execute("SELECT last_sync_at FROM system_status LIMIT 1").first()
    if not row or not row[0]:
        return False
    return (datetime.now(timezone.utc) - row[0]) < timedelta(minutes=SYNC_MAX_DELAY_MIN)

def check_resources():
    ram = psutil.virtual_memory().percent
    disk = shutil.disk_usage("/").used / shutil.disk_usage("/").total * 100.0
    return ram, disk

def run_health_checks(db: Session):
    alerts = []
    if not last_sync_ok(db):
        alerts.append(f"Backend-Sync delayed > {SYNC_MAX_DELAY_MIN} min")

    ram, disk = check_resources()
    if ram > 95: alerts.append(f"RAM > 95% (current: {ram:.1f}%)")
    if disk > 90: alerts.append(f"Disk > 90% (current: {disk:.1f}%)")

    # TODO: Worker/Scheduler/WS/Bybit API Ping hier prüfen…

    for msg in alerts:
        notify_system_health_alert(db, msg, {"time": datetime.now(timezone.utc).isoformat()})

# z.B. in einem Background-Task alle 5 Minuten ausführen