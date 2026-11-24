import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

import models
from database import engine
from media_utils import UPLOAD_DIR, ensure_upload_dir
from routers.auth import router as auth_router, set_init_db_fn
from routers.hub import router as hub_router
from routers.messages import router as messages_router
from routers.news import router as news_router
from routers.posts import router as posts_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("turk_hub")


def sync_db_schema(engine) -> None:
    """Safely add missing columns to older PostgreSQL deployments."""
    if engine.dialect.name != "postgresql":
        return

    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect database schema; skipping column sync")
        return

    preparer = engine.dialect.identifier_preparer

    def add_column(
        table_name: str,
        column_name: str,
        column_type: str,
        unique: bool = False,
    ) -> None:
        quoted_table = preparer.quote(table_name)
        quoted_column = preparer.quote(column_name)
        suffix = " UNIQUE" if unique else ""
        statement = (
            f"ALTER TABLE IF EXISTS {quoted_table} "
            f"ADD COLUMN IF NOT EXISTS {quoted_column} {column_type}{suffix}"
        )
        try:
            with engine.begin() as conn:
                conn.execute(text(statement))
        except Exception:
            logger.warning(
                "Could not add column %s.%s during schema sync",
                table_name,
                column_name,
                exc_info=True,
            )
            if unique:
                try:
                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                f"ALTER TABLE IF EXISTS {quoted_table} "
                                f"ADD COLUMN IF NOT EXISTS {quoted_column} {column_type}"
                            )
                        )
                except Exception:
                    logger.warning(
                        "Could not add fallback column %s.%s",
                        table_name,
                        column_name,
                        exc_info=True,
                    )

    for table in models.Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        try:
            existing_columns = {
                column["name"] for column in inspector.get_columns(table.name)
            }
        except Exception:
            logger.warning(
                "Could not inspect columns for table %s",
                table.name,
                exc_info=True,
            )
            continue

        for column in table.columns:
            if column.name in existing_columns or column.primary_key:
                continue
            if (
                not column.nullable
                and column.default is None
                and column.server_default is None
            ):
                continue
            try:
                column_type = column.type.compile(dialect=engine.dialect)
            except Exception:
                column_type = "TEXT"
            if column.name == "account_type":
                column_type = f"{column_type} NOT NULL DEFAULT 'individual'"
            elif column.name in ("is_admin", "is_verified"):
                column_type = f"{column_type} NOT NULL DEFAULT FALSE"
            add_column(table.name, column.name, column_type, bool(column.unique))

    legacy_user_columns = {
        "username": ("VARCHAR(100)", True),
        "avatar_url": ("VARCHAR(255)", False),
        "bio": ("TEXT", False),
        "country": ("VARCHAR(100)", False),
        "university": ("VARCHAR(255)", False),
        "profile_picture": ("VARCHAR(255)", False),
        "created_at": ("TIMESTAMP", False),
    }
    if "users" in existing_tables:
        try:
            existing_user_columns = {
                column["name"] for column in inspector.get_columns("users")
            }
        except Exception:
            existing_user_columns = set()
        for name, (column_type, unique) in legacy_user_columns.items():
            if name not in existing_user_columns:
                add_column("users", name, column_type, unique)


def _seed_dictionary_if_empty() -> None:
    """Populate default Pan-Turkic dictionary data when the table is empty."""
    from database import SessionLocal
    from seed import seed_dictionary

    db = SessionLocal()
    try:
        if db.query(models.Dictionary).count() > 0:
            return
        added = seed_dictionary(db)
        logger.info("Seeded %s Pan-Turkic dictionary entries", added)
    except Exception:
        db.rollback()
        logger.exception("Automatic dictionary seeding failed")
    finally:
        db.close()


def _seed_news_if_empty() -> None:
    from database import SessionLocal

    db = SessionLocal()
    try:
        if db.query(models.News).count() > 0:
            return
        first_user = db.query(models.User).order_by(models.User.id.asc()).first()
        if not first_user:
            return
        db.add_all([
            models.News(
                title="TÜRK FORUM 2026",
                content="The official Pan-Turkic forum brings young innovators together for dialogue, cultural exchange, and joint projects across six Turkic states.",
                category="Forum",
                status="approved",
                is_pinned=True,
                author_id=first_user.id,
            ),
            models.News(
                title="Turkic Tech Scholarship 2026",
                content="Holberton School Azerbaijan announces a scholarship initiative for students building technology solutions across the Turkic youth community.",
                category="Scholarship",
                status="approved",
                is_pinned=False,
                author_id=first_user.id,
            ),
        ])
        db.commit()
        logger.info("Seeded approved news announcements")
    except Exception:
        db.rollback()
        logger.exception("Could not seed news announcements")
    finally:
        db.close()


def init_db() -> bool:
    """Create missing tables, reconcile old PostgreSQL schemas, and verify the DB."""
    try:
        models.Base.metadata.create_all(bind=engine)
        try:
            from seed import ensure_schema_columns

            ensure_schema_columns(engine)
        except Exception:
            logger.exception("Schema column sync failed")
        sync_db_schema(engine)
        try:
            admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
            if admin_email:
                from database import SessionLocal
                db = SessionLocal()
                try:
                    admin = db.query(models.User).filter(models.User.email.ilike(admin_email)).first()
                    if admin and not admin.is_admin:
                        admin.is_admin = True
                        db.commit()
                finally:
                    db.close()
        except Exception:
            logger.exception("Could not promote configured Super Admin")
        _seed_dictionary_if_empty()
        _seed_news_if_empty()
        logger.info("Database schema verified/created successfully")
        return True
    except Exception:
        logger.exception("Database initialization failed")
        return False


# Wire init_db callback for auth router schema repairs
set_init_db_fn(init_db)

# Try at import time for environments that do not run the ASGI lifespan.
init_db()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_upload_dir()
    init_db()
    yield


app = FastAPI(
    title="Türk Youth Hub API",
    description="Backend API for Turkic Youth Social Innovation Platform",
    version="1.0.0",
    lifespan=lifespan,
)

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,"
        "http://127.0.0.1:4173,http://localhost:3000,http://127.0.0.1:3000,"
        "https://turk-hub.vercel.app",
    ).split(",")
    if o.strip()
]

# Covers Vercel preview deployments and subdomains such as
# https://<branch>.vercel.app and https://app.turk-hub.vercel.app.
CORS_ORIGIN_REGEX = r"https://([a-zA-Z0-9-]+\.)*(turk-hub\.)?vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_error_response(
    request: Request,
    status_code: int,
    content: dict,
) -> JSONResponse:
    """Build an error response that is safe to send through the browser."""
    response = JSONResponse(status_code=status_code, content=content)
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    logger.warning(
        "Payload validation failed for %s %s: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return _cors_error_response(
        request,
        status.HTTP_400_BAD_REQUEST,
        {"detail": jsonable_encoder(exc.errors())},
    )


SAFE_LIST_GET_PREFIXES = (
    "/api/projects",
    "/projects",
    "/api/posts",
    "/posts",
    "/api/dictionary",
    "/dictionary",
    "/api/messages",
    "/messages",
    "/api/notifications",
    "/notifications",
    "/api/stories",
    "/stories",
    "/api/users",
    "/users",
)


@app.exception_handler(Exception)
async def catch_all_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    logger.error(
        "Unhandled exception for %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    if request.method == "GET" and any(
        request.url.path == prefix or request.url.path.startswith(f"{prefix}/")
        for prefix in SAFE_LIST_GET_PREFIXES
    ):
        return _cors_error_response(request, status.HTTP_200_OK, [])
    return _cors_error_response(
        request,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {"detail": "Daxili server xətası"},
    )


ensure_upload_dir()
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Türk Youth Hub API işləyir! 🐺",
        "version": "1.0.0"
    }


# Include domain routers with 100% backwards-compatible route definitions
app.include_router(auth_router)
app.include_router(posts_router)
app.include_router(messages_router)
app.include_router(hub_router)
app.include_router(news_router)
