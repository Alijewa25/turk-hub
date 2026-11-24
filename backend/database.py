import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

ENV = os.getenv("ENV", "development").strip().lower()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    if ENV == "production":
        raise RuntimeError("DATABASE_URL must be set when ENV=production")
    DATABASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_PATH = os.path.join(DATABASE_DIR, "turk_hub.db")
    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

SQLALCHEMY_DATABASE_URL = DATABASE_URL

# Render/Heroku 'postgres://' verdikdə SQLAlchemy 1.4+ üçün 'postgresql://' fərqini düzəldirik
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
elif SQLALCHEMY_DATABASE_URL.startswith("sqlite:///"):
    sqlite_path = SQLALCHEMY_DATABASE_URL[len("sqlite:///"):]
    if not os.path.isabs(sqlite_path):
        DATABASE_DIR = os.path.dirname(os.path.abspath(__file__))
        SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DATABASE_DIR, os.path.basename(sqlite_path))}"

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