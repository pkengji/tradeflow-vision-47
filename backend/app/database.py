import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1) DATABASE_URL aus .env lesen oder Fallback zu lokalem Postgres
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:Meineoma17.@localhost:5432/tradingbot"
)

# 2) Engine erstellen (für Postgres KEINE connect_args nötig)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    future=True,
    echo=False,
    pool_pre_ping=True,
)

# 3) Session-Factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)

# 4) Base class für alle Models
Base = declarative_base()