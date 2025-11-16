from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app import models
import os

# 1) Alte SQLite-DB
SQLITE_URL = "sqlite:///./tradingbot.db"
sqlite_engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False}
)
SqliteSession = sessionmaker(bind=sqlite_engine)

# 2) Neue Postgres-DB (aus env oder direkt String)
POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:Meineoma17.@localhost:5432/tradingbot",
)
postgres_engine = create_engine(POSTGRES_URL, future=True)
PostgresSession = sessionmaker(bind=postgres_engine)

def copy_table(src_sess, dst_sess, Model):
    rows = src_sess.query(Model).all()
    for r in rows:
        data = {c.name: getattr(r, c.name) for c in Model.__table__.columns}
        dst_sess.merge(Model(**data))

def main():
    # 1) Tabellen in Postgres anlegen
    Base.metadata.create_all(bind=postgres_engine)

    src = SqliteSession()
    dst = PostgresSession()

    # 2) Reihenfolge wichtig wegen Foreign Keys
    models_in_order = [
        models.User,
        models.Bot,
        models.Symbol,
        models.Position,
        models.Execution,
        models.FundingEvent,
        models.Cashflow,
        models.TvSignal,
        models.OutboxItem,
        # falls du noch weitere Tabellen hast, hier ergänzen
    ]

    for Model in models_in_order:
        print(f"Kopiere {Model.__tablename__} ...")
        copy_table(src, dst, Model)

    dst.commit()
    src.close()
    dst.close()
    print("Migration abgeschlossen.")

if __name__ == "__main__":
    main()
