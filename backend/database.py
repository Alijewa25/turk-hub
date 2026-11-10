import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Render və ya Neon-dan gələn PostgreSQL URL-ini götürür, yoxdursa lokal SQLite istifadə edir
_LOCAL_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "turk_hub.db")
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{_LOCAL_DB_PATH}"

# Render/Heroku 'postgres://' verdikdə SQLAlchemy 1.4+ üçün 'postgresql://' fərqini düzəldirik
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=30,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

if "sqlite" in SQLALCHEMY_DATABASE_URL:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()