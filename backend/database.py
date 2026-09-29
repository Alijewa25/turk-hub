import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Render və ya Neon-dan gələn PostgreSQL URL-ini götürür, yoxdursa lokal SQLite istifadə edir
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./turk_hub.db")

# Render/Heroku 'postgres://' verdikdə SQLAlchemy 1.4+ üçün 'postgresql://' fərqini düzəldirik
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()