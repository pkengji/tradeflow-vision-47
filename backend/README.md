# TradingBot Backend API

FastAPI-basiertes Backend für die TradingBot-Anwendung.

## Features

- ✅ Vollständige REST API für Bots, Positions, Orders, Funding
- ✅ User Management (CRUD für Users, Profile, Settings)
- ✅ Notification Settings
- ✅ Dashboard KPIs & Daily PnL
- ✅ Outbox für Signal Approval
- ✅ SQLite Datenbank mit SQLAlchemy ORM
- ✅ Automatische Sample-Daten beim ersten Start
- ✅ Test Owner User: `test@gmail.com` / `test` / `test`

## Installation

1. **Requirements installieren:**
```bash
cd backend
pip install -r ../requirements.txt
```

2. **Backend starten:**
```bash
python main.py
```

Das Backend läuft dann auf `http://127.0.0.1:8000`

## API Dokumentation

Nach dem Start ist die interaktive API-Dokumentation verfügbar unter:
- **Swagger UI:** http://127.0.0.1:8000/docs
- **ReDoc:** http://127.0.0.1:8000/redoc

## Initialer Test-User

Beim ersten Start wird automatisch ein Owner-Account erstellt:

- **Email:** test@gmail.com
- **Username:** test
- **Passwort:** test
- **Role:** owner

## Datenbank

Die SQLite-Datenbank `tradingbot.db` wird automatisch beim ersten Start erstellt und mit Sample-Daten gefüllt:

- 3 Bots (active/paused)
- Mehrere Positions (open/closed)
- 5 Trading-Symbole (BTC, ETH, SOL, BNB, ADA)
- 30 Tage Daily PnL-Daten
- Outbox Items für Signal-Approval

## Hauptendpunkte

### Bots
- `GET /api/v1/bots` - Alle Bots
- `POST /api/v1/bots` - Bot erstellen
- `PATCH /api/v1/bots/{id}` - Bot aktualisieren
- `POST /api/v1/bots/{id}/pause` - Bot pausieren
- `POST /api/v1/bots/{id}/resume` - Bot starten
- `DELETE /api/v1/bots/{id}` - Bot löschen

### Positions
- `GET /api/v1/positions` - Alle Positionen (mit Filtern)
- `GET /api/v1/positions/{id}` - Position Details
- `POST /api/v1/positions/{id}/set-sl-tp` - SL/TP setzen
- `POST /api/v1/positions/{id}/close` - Position schließen

### Users
- `POST /api/v1/admin/users` - User erstellen
- `PATCH /api/v1/user/profile` - Profil aktualisieren
- `PATCH /api/v1/user/password` - Passwort ändern
- `PATCH /api/v1/user/timezone` - Zeitzone setzen
- `GET /api/v1/user/notifications` - Notification Settings
- `PATCH /api/v1/user/notifications` - Notification Settings ändern

### Dashboard
- `GET /api/v1/dashboard/kpis` - KPI-Daten (PnL, Win-Rate, etc.)
- `GET /api/v1/dashboard/daily-pnl` - Tägliche PnL-Daten

### Outbox
- `GET /api/v1/outbox` - Pending Signals
- `POST /api/v1/outbox/{id}/approve` - Signal genehmigen
- `POST /api/v1/outbox/{id}/reject` - Signal ablehnen

## Projektstruktur

```
backend/
├── main.py           # FastAPI App & Endpoints
├── database.py       # DB Setup & Session
├── models.py         # SQLAlchemy Models
├── schemas.py        # Pydantic Schemas
├── crud.py           # CRUD Operationen
├── auth.py           # Authentifizierung
└── tradingbot.db     # SQLite DB (auto-generiert)
```

## Development

### Datenbank zurücksetzen

Einfach `tradingbot.db` löschen und das Backend neu starten - alle Sample-Daten werden automatisch neu erstellt.

### CORS

CORS ist für alle Origins aktiviert - für Production sollte dies eingeschränkt werden.
