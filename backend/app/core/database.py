from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

if engine.url.get_backend_name() == "sqlite":
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        # SQLite는 기본값이 FK OFF — 켜지 않으면 ForeignKey/CASCADE가 전부 무시된다.
        # WAL + busy_timeout: FastAPI 스레드풀에서 읽기/쓰기가 겹칠 때 'database is locked' 방지.
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
