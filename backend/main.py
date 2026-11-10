from fastapi import Body, FastAPI, Depends, Query, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session
from pydantic import ValidationError
from contextlib import asynccontextmanager
from typing import Any, List, Optional
from urllib import request as urllib_request
import asyncio, json, os, re, uuid, logging

from jose import JWTError, jwt

import models
import schemas
from database import engine, get_db
from auth_utils import (
    ALGORITHM,
    SECRET_KEY,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("turk_hub")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")


def ensure_upload_dir() -> None:
    """Create backend/uploads regardless of the process working directory."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)


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
        _seed_dictionary_if_empty()
        logger.info("Database schema verified/created successfully")
        return True
    except Exception:
        logger.exception("Database initialization failed")
        return False


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

# Production/preview origins must always be allowed, even when CORS_ORIGINS is
# overridden by the hosting provider (e.g. Render environment variables).
REQUIRED_CORS_ORIGINS = [
    "https://turk-hub.vercel.app",
    "https://www.turk-hub.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "*",
]
for origin in REQUIRED_CORS_ORIGINS:
    if origin not in CORS_ORIGINS:
        CORS_ORIGINS.append(origin)

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

# --- DICTIONARY ENDPOINTS ---

@app.get("/api/dictionary", response_model=List[schemas.DictionaryResponse])
@app.get("/api/dictionary/search", response_model=List[schemas.DictionaryResponse])
@app.get("/dictionary", response_model=List[schemas.DictionaryResponse])
@app.get("/dictionary/search", response_model=List[schemas.DictionaryResponse])
def search_dictionary(
    q: Optional[str] = Query(None, description="Axtarış sözü"),
    dialect: Optional[str] = Query(None),
    compare: Optional[bool] = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(models.Dictionary)
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            (models.Dictionary.root_concept.ilike(search_pattern)) |
            (models.Dictionary.az_val.ilike(search_pattern)) |
            (models.Dictionary.tr_val.ilike(search_pattern)) |
            (models.Dictionary.kk_val.ilike(search_pattern)) |
            (models.Dictionary.uz_val.ilike(search_pattern)) |
            (models.Dictionary.ky_val.ilike(search_pattern)) |
            (models.Dictionary.tm_val.ilike(search_pattern)) |
            (models.Dictionary.ug_val.ilike(search_pattern)) |
            (models.Dictionary.proto_root.ilike(search_pattern)) |
            (models.Dictionary.etymology_note.ilike(search_pattern))
        )
    results = _safe_list_query(lambda: query.all(), db, "dictionary")
    return results


@app.get("/api/dictionary/compare")
def dictionary_compare(
    q: str = Query(...),
    db: Session = Depends(get_db)
):
    search_pattern = f"%{q}%"
    items = _safe_list_query(
        lambda: db.query(models.Dictionary).filter(
            (models.Dictionary.root_concept.ilike(search_pattern)) |
            (models.Dictionary.az_val.ilike(search_pattern)) |
            (models.Dictionary.tr_val.ilike(search_pattern)) |
            (models.Dictionary.kk_val.ilike(search_pattern)) |
            (models.Dictionary.uz_val.ilike(search_pattern)) |
            (models.Dictionary.ky_val.ilike(search_pattern)) |
            (models.Dictionary.tm_val.ilike(search_pattern)) |
            (models.Dictionary.ug_val.ilike(search_pattern)) |
            (models.Dictionary.proto_root.ilike(search_pattern)) |
            (models.Dictionary.etymology_note.ilike(search_pattern))
        ).all(),
        db,
        "dictionary compare",
    )
    comparison = []
    for item in items:
        comparison.append({
            "root": item.root_concept,
            "proto_root": item.proto_root,
            "forms": {
                "az": item.az_val,
                "tr": item.tr_val,
                "kk": item.kk_val,
                "uz": item.uz_val,
                "ky": item.ky_val,
                "tm": item.tm_val,
                "ug": item.ug_val,
            },
            "etymology": item.etymology_note,
        })
    return {"query": q, "comparison": comparison}


@app.post("/api/dictionary/submit", response_model=schemas.DictionaryResponse)
@app.post("/dictionary/submit", response_model=schemas.DictionaryResponse)
def submit_dictionary_entry(
    entry: schemas.DictionaryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_entry = models.Dictionary(
        root_concept=entry.root_concept,
        proto_root=entry.proto_root,
        az_val=entry.az_val,
        tr_val=entry.tr_val,
        kk_val=entry.kk_val,
        uz_val=entry.uz_val,
        ky_val=entry.ky_val,
        tm_val=entry.tm_val,
        ug_val=entry.ug_val,
        etymology_note=entry.etymology_note,
        submitted_by=current_user.id,
        approved=1,
        source="user"
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry

# --- AUTHENTICATION ENDPOINTS ---

def _run_auth_db_operation(operation, db: Session, action: str, identity: str):
    try:
        return operation()
    except OperationalError:
        db.rollback()
        logger.exception(
            "%s database operation failed for %s; attempting schema repair",
            action,
            identity,
        )

    if not init_db():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verilənlər bazası hazır deyil",
        )

    try:
        return operation()
    except OperationalError as exc:
        db.rollback()
        logger.exception(
            "%s database operation still failing after schema repair for %s",
            action,
            identity,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verilənlər bazasına qoşulmaq mümkün deyil",
        ) from exc


def _register_user(user: schemas.UserCreate, db: Session):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Bu e-poçt ünvanı artıq istifadə olunur"
        )

    username = user.username
    if username:
        username_clean = username.strip().lstrip('@').lower()
        if db.query(models.User).filter(models.User.username == username_clean).first():
            raise HTTPException(
                status_code=400,
                detail="Bu istifadəçi adı artıq istifadə olunur"
            )
        username = username_clean
    else:
        base = user.email.split('@')[0].lower().replace('.', '')
        candidate = base
        idx = 1
        while db.query(models.User).filter(models.User.username == candidate).first():
            candidate = f"{base}{idx}"
            idx += 1
        username = candidate

    hashed_password = hash_password(user.password)
    db_user = models.User(
        full_name=user.full_name,
        email=user.email,
        username=username,
        password_hash=hashed_password,
        country=user.country
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def _login_user(form_data: OAuth2PasswordRequestForm, db: Session):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yanlış e-poçt və ya şifrə",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/auth/register", response_model=schemas.UserResponse)
@app.post("/register", response_model=schemas.UserResponse)
@app.post("/auth/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    try:
        return _run_auth_db_operation(
            lambda: _register_user(user, db),
            db,
            "register",
            user.email,
        )
    except HTTPException:
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.exception("Registration integrity error for %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bu e-poçt və ya istifadəçi adı artıq istifadə olunur",
        ) from exc
    except (ValidationError, ValueError) as exc:
        db.rollback()
        logger.exception("Registration validation error for %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Qeydiyyat məlumatları düzgün deyil",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Registration database error for %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verilənlər bazası xətası",
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Registration failed for %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Qeydiyyat zamanı gözlənilməz xəta baş verdi",
        ) from exc


@app.post("/api/auth/login", response_model=schemas.Token)
@app.post("/login", response_model=schemas.Token)
@app.post("/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        return _run_auth_db_operation(
            lambda: _login_user(form_data, db),
            db,
            "login",
            form_data.username,
        )
    except HTTPException:
        raise
    except (ValidationError, ValueError) as exc:
        db.rollback()
        logger.exception("Login validation error for %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Giriş məlumatları düzgün deyil",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Login database error for %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verilənlər bazası xətası",
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Login failed for %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Giriş zamanı gözlənilməz xəta baş verdi",
        ) from exc

@app.get("/api/auth/me", response_model=schemas.UserResponse)
@app.get("/me", response_model=schemas.UserResponse)
@app.get("/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


def _safe_list_query(operation, db: Session, label: str):
    try:
        return operation()
    except Exception:
        db.rollback()
        logger.exception("%s query failed; attempting schema repair", label)

    if not init_db():
        return []

    try:
        return operation()
    except Exception:
        db.rollback()
        logger.exception("%s query failed after schema repair", label)
        return []


def _safe_first_query(operation, db: Session, label: str):
    try:
        return operation()
    except Exception:
        db.rollback()
        logger.exception("%s query failed", label)
        return None


# --- PROJECT HUB ENDPOINTS ---

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
@app.get("/projects", response_model=List[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    return _safe_list_query(
        lambda: db.query(models.Project).all(),
        db,
        "projects",
    )

@app.post("/api/projects", response_model=schemas.ProjectResponse)
@app.post("/projects", response_model=schemas.ProjectResponse)
def create_project(
    project: schemas.ProjectCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_project = models.Project(
        title=project.title,
        description=project.description,
        required_skills=project.required_skills,
        target_countries=project.target_countries,
        contact_info=project.contact_info,
        owner_id=current_user.id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

# --- USER PROFILE & AVATAR ENDPOINTS ---

@app.get("/api/users", response_model=List[schemas.UserFollowInfo])
@app.get("/users", response_model=List[schemas.UserFollowInfo])
@app.get("/api/users/search", response_model=List[schemas.UserFollowInfo])
@app.get("/users/search", response_model=List[schemas.UserFollowInfo])
def list_users(
    exclude_self: bool = True,
    q: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_query = db.query(models.User)
    if exclude_self:
        db_query = db_query.filter(models.User.id != current_user.id)
    term = (q or query or search or username or "").strip().lstrip("@")
    if term:
        pattern = f"%{term}%"
        db_query = db_query.filter(
            (models.User.full_name.ilike(pattern)) |
            (models.User.username.ilike(pattern)) |
            (models.User.email.ilike(pattern))
        )
    users = _safe_list_query(lambda: db_query.all(), db, "users")

    result = []
    for u in users:
        try:
            result.append(_follow_info(u, current_user, db))
        except Exception:
            logger.warning("Could not serialize user %s", getattr(u, "id", "?"), exc_info=True)
    return result


@app.get("/api/users/profile", response_model=schemas.UserResponse)
@app.get("/users/profile", response_model=schemas.UserResponse)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/api/users/by-username/{username}", response_model=schemas.UserFollowInfo)
@app.get("/users/by-username/{username}", response_model=schemas.UserFollowInfo)
@app.get("/api/users/username/{username}", response_model=schemas.UserFollowInfo)
@app.get("/users/username/{username}", response_model=schemas.UserFollowInfo)
def get_user_by_username(
    username: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean = username.strip().lstrip("@").lower()
    user = db.query(models.User).filter(models.User.username == clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    return _follow_info(user, current_user, db)


@app.get("/api/users/{user_id}", response_model=schemas.UserFollowInfo)
@app.get("/users/{user_id}", response_model=schemas.UserFollowInfo)
def get_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    return _follow_info(user, current_user, db)


@app.put("/api/users/profile", response_model=schemas.UserResponse)
@app.patch("/api/users/profile", response_model=schemas.UserResponse)
@app.put("/users/profile", response_model=schemas.UserResponse)
@app.patch("/users/profile", response_model=schemas.UserResponse)
@app.put("/api/users/me", response_model=schemas.UserResponse)
@app.patch("/api/users/me", response_model=schemas.UserResponse)
@app.put("/users/me", response_model=schemas.UserResponse)
@app.patch("/users/me", response_model=schemas.UserResponse)
def update_me(
    payload: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if payload.username is not None:
        username_clean = payload.username.strip().lstrip('@').lower()
        existing = db.query(models.User).filter(models.User.username == username_clean, models.User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bu istifadəçi adı artıq istifadə olunur")
        current_user.username = username_clean
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.country is not None:
        current_user.country = payload.country
    if payload.university is not None:
        current_user.university = payload.university
    if payload.bio is not None:
        current_user.bio = payload.bio
    if payload.profile_picture is not None:
        current_user.profile_picture = payload.profile_picture
    if getattr(payload, 'avatar_url', None) is not None:
        current_user.profile_picture = payload.avatar_url
    if getattr(payload, 'university', None) is None and getattr(payload, 'institution', None) is not None:
        current_user.university = payload.institution
    if getattr(payload, 'skills', None) is not None and isinstance(payload.skills, list):
        db.query(models.UserSkill).filter(models.UserSkill.user_id == current_user.id).delete()
        for skill in payload.skills:
            if isinstance(skill, str) and skill.strip():
                db.add(models.UserSkill(user_id=current_user.id, skill_name=skill.strip()))
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/api/users/upload-avatar")
@app.post("/users/upload-avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Yalnız şəkil formatları qəbul olunur (.jpg, .jpeg, .png, .webp)")

    fname = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    
    with open(path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    avatar_path = f"/uploads/{fname}"
    current_user.profile_picture = avatar_path
    if hasattr(current_user, 'avatar_url'):
        setattr(current_user, 'avatar_url', avatar_path)

    db.commit()
    db.refresh(current_user)

    return {"status": "ok", "avatar_url": avatar_path, "url": avatar_path}


@app.post("/api/upload")
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="İcazə verilməyən fayl formatı")

    max_bytes = 5 * 1024 * 1024
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    size = 0
    with open(path, "wb") as buffer:
        while True:
            chunk = await file.read(1024 * 64)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                buffer.close()
                try:
                    os.remove(path)
                except OSError:
                    pass
                raise HTTPException(status_code=400, detail="Fayl ölçüsü 5MB-dan böyük ola bilməz")
            buffer.write(chunk)
    return {"url": f"/uploads/{fname}", "filename": file.filename}


# --- FOLLOW SYSTEM ---

@app.get("/api/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
@app.get("/api/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
@app.get("/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
@app.get("/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
def list_followers(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    follows = _safe_list_query(
        lambda: db.query(models.Follow).filter(models.Follow.followed_id == user_id).all(),
        db,
        "followers",
    )
    users = []
    for f in follows:
        u = _safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == f.follower_id).first(),
            db,
            "follower user",
        )
        if u:
            try:
                users.append(_follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize follower %s", getattr(u, "id", "?"), exc_info=True)
    return users


@app.get("/api/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
def list_following(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    follows = _safe_list_query(
        lambda: db.query(models.Follow).filter(models.Follow.follower_id == user_id).all(),
        db,
        "following",
    )
    users = []
    for f in follows:
        u = _safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == f.followed_id).first(),
            db,
            "following user",
        )
        if u:
            try:
                users.append(_follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize following %s", getattr(u, "id", "?"), exc_info=True)
    return users


@app.post("/api/users/{user_id}/follow", response_model=schemas.FollowStatus)
@app.post("/users/{user_id}/follow", response_model=schemas.FollowStatus)
def follow_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Özünüzü izləyə bilməzsiniz")

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")

    existing = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.followed_id == user_id,
    ).first()
    if not existing:
        db.add(models.Follow(follower_id=current_user.id, followed_id=user_id))
        db.commit()

    return _follow_status(current_user.id, user_id, db)


@app.delete("/api/users/{user_id}/follow", response_model=schemas.FollowStatus)
@app.delete("/users/{user_id}/follow", response_model=schemas.FollowStatus)
def unfollow_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")

    existing = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.followed_id == user_id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()

    return _follow_status(current_user.id, user_id, db)


# --- POSTS ---

@app.get("/api/posts", response_model=List[schemas.PostResponse])
@app.get("/posts", response_model=List[schemas.PostResponse])
def list_posts(
    limit: int = Query(100, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    posts = _safe_list_query(
        lambda: db.query(models.Post).order_by(models.Post.created_at.desc()).limit(limit).all(),
        db,
        "posts",
    )
    result = []
    for p in posts:
        try:
            result.append(schemas.PostResponse(
                id=p.id,
                user_id=p.user_id,
                body=p.body,
                image_url=p.image_url,
                file_url=p.file_url,
                file_name=p.file_name,
                likes_count=p.likes_count or 0,
                comments_count=p.comments_count or 0,
                created_at=p.created_at,
                author=schemas.UserResponse.model_validate(p.author) if p.author else None,
            ))
        except Exception:
            logger.warning("Could not serialize post %s", getattr(p, "id", "?"), exc_info=True)
    return result


@app.post("/api/posts", response_model=schemas.PostResponse)
@app.post("/posts", response_model=schemas.PostResponse)
def create_post(
    payload: schemas.PostCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = models.Post(
        user_id=current_user.id,
        body=payload.body,
        image_url=payload.image_url,
        file_url=payload.file_url,
        file_name=payload.file_name,
        likes_count=0,
        comments_count=0,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return schemas.PostResponse(
        id=post.id,
        user_id=post.user_id,
        body=post.body,
        image_url=post.image_url,
        file_url=post.file_url,
        file_name=post.file_name,
        likes_count=post.likes_count or 0,
        comments_count=post.comments_count or 0,
        created_at=post.created_at,
        author=schemas.UserResponse.model_validate(current_user),
    )


@app.get("/api/users/{user_id}/posts", response_model=List[schemas.PostResponse])
@app.get("/users/{user_id}/posts", response_model=List[schemas.PostResponse])
def user_posts(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    posts = _safe_list_query(
        lambda: db.query(models.Post).filter(models.Post.user_id == user_id).order_by(models.Post.created_at.desc()).all(),
        db,
        "user posts",
    )
    result = []
    for p in posts:
        try:
            result.append(schemas.PostResponse(
                id=p.id,
                user_id=p.user_id,
                body=p.body,
                image_url=p.image_url,
                file_url=p.file_url,
                file_name=p.file_name,
                likes_count=p.likes_count or 0,
                comments_count=p.comments_count or 0,
                created_at=p.created_at,
                author=schemas.UserResponse.model_validate(p.author) if p.author else None,
            ))
        except Exception:
            logger.warning("Could not serialize post %s", getattr(p, "id", "?"), exc_info=True)
    return result


@app.post("/api/posts/{post_id}/like")
@app.post("/posts/{post_id}/like")
def like_post(
    post_id: str,
    payload: Optional[Any] = Body(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        numeric_post_id = int(post_id)
    except (TypeError, ValueError):
        return {"status": "ok", "persisted": False}

    post = db.query(models.Post).filter(models.Post.id == numeric_post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    post.likes_count = (post.likes_count or 0) + 1
    db.commit()
    return {"status": "ok", "likes_count": post.likes_count}

@app.post("/api/posts/{post_id}/comment")
def comment_post(post_id: int, payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Rəy boş ola bilməz")
    post.comments_count = (post.comments_count or 0) + 1
    db.commit()
    return {"status": "ok", "comments_count": post.comments_count}


# --- MESSAGES (DM) ---

@app.get("/api/messages/conversations")
@app.get("/messages/conversations")
def conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    sent = _safe_list_query(
        lambda: db.query(models.Message.receiver_id).filter(models.Message.sender_id == current_user.id).distinct().all(),
        db,
        "sent conversations",
    )
    received = _safe_list_query(
        lambda: db.query(models.Message.sender_id).filter(models.Message.receiver_id == current_user.id).distinct().all(),
        db,
        "received conversations",
    )
    ids = set([s[0] for s in sent] + [r[0] for r in received])
    users = []
    for uid in ids:
        u = _safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == uid).first(),
            db,
            "conversation user",
        )
        if u:
            try:
                users.append(_follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize conversation user %s", getattr(u, "id", "?"), exc_info=True)
    return users


@app.get("/api/messages")
@app.get("/messages")
def list_messages(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return conversations(current_user, db)


@app.get("/api/messages/{user_id}", response_model=List[schemas.MessageResponse])
@app.get("/messages/{user_id}", response_model=List[schemas.MessageResponse])
def get_messages(user_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = _safe_list_query(
        lambda: db.query(models.Message).filter(
            ((models.Message.sender_id == current_user.id) & (models.Message.receiver_id == user_id)) |
            ((models.Message.sender_id == user_id) & (models.Message.receiver_id == current_user.id))
        ).order_by(models.Message.created_at.asc()).all(),
        db,
        "messages",
    )
    result = []
    for m in msgs:
        try:
            result.append(schemas.MessageResponse(
                id=m.id,
                sender_id=m.sender_id,
                receiver_id=m.receiver_id,
                content=m.content,
                read=m.read,
                created_at=m.created_at,
                sender=schemas.UserResponse.model_validate(m.sender) if m.sender else None,
                receiver=schemas.UserResponse.model_validate(m.receiver) if m.receiver else None,
            ))
        except Exception:
            logger.warning("Could not serialize message %s", getattr(m, "id", "?"), exc_info=True)
    return result


@app.post("/api/messages", response_model=schemas.MessageResponse)
@app.post("/messages", response_model=schemas.MessageResponse)
def send_message(payload: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.receiver_id is None:
        raise HTTPException(status_code=400, detail="Alıcı ID tələb olunur")
    if not (payload.content or "").strip():
        raise HTTPException(status_code=400, detail="Mesaj boş ola bilməz")
    if payload.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Özünüzə mesaj göndərə bilməzsiniz")
    receiver = db.query(models.User).filter(models.User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Alıcı tapılmadı")
    msg = models.Message(sender_id=current_user.id, receiver_id=payload.receiver_id, content=payload.content.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return schemas.MessageResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        content=msg.content,
        read=msg.read,
        created_at=msg.created_at,
        sender=schemas.UserResponse.model_validate(current_user),
        receiver=schemas.UserResponse.model_validate(receiver),
    )


# --- STORIES ---

@app.get("/api/stories/feed", response_model=List[schemas.StoryResponse])
@app.get("/stories/feed", response_model=List[schemas.StoryResponse])
def story_feed(
    limit: int = Query(50, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stories = _safe_list_query(
        lambda: db.query(models.Story).order_by(
            models.Story.created_at.desc()
        ).limit(limit).all(),
        db,
        "stories",
    )
    result = []
    for story in stories:
        try:
            result.append(_story_response(story))
        except Exception:
            logger.warning("Could not serialize story %s", getattr(story, "id", "?"), exc_info=True)
    return result


@app.post("/api/stories", response_model=schemas.StoryResponse)
@app.post("/stories", response_model=schemas.StoryResponse)
def create_story(
    payload: schemas.StoryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    story = models.Story(
        user_id=current_user.id,
        country=payload.country if payload.country else current_user.country,
        text=payload.text,
        media_url=payload.media_url,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return _story_response(story)


# --- NOTIFICATIONS ---

@app.get("/api/notifications")
@app.get("/notifications")
def list_notifications():
    return []


# --- AI TRANSLATION ---

SUPPORTED_TRANSLATION_LANGS = {"az", "tr", "kk", "uz", "tm", "ky", "en"}

TRANSLATION_LANG_ALIASES = {
    "az": "az",
    "aze": "az",
    "azerbaijani": "az",
    "azerbaijan": "az",
    "azerbaijani_turkish": "az",
    "tr": "tr",
    "tur": "tr",
    "turkish": "tr",
    "turkiye": "tr",
    "turkey": "tr",
    "kk": "kk",
    "kaz": "kk",
    "kazakh": "kk",
    "qazaq": "kk",
    "uz": "uz",
    "uzb": "uz",
    "uzbek": "uz",
    "ozbek": "uz",
    "tm": "tm",
    "tkm": "tm",
    "turkmen": "tm",
    "turkmenistan": "tm",
    "ky": "ky",
    "kyg": "ky",
    "kyrgyz": "ky",
    "kirgiz": "ky",
    "en": "en",
    "eng": "en",
    "english": "en",
}

TRANSLATION_LEXICON: List[dict] = [
    {"az": "salam", "tr": "merhaba", "kk": "сәлем", "uz": "salom", "tm": "salam", "ky": "салам", "en": "hello"},
    {"az": "sabahınız xeyir", "tr": "günaydın", "kk": "қайырлы таң", "uz": "xayrli tong", "tm": "ertiriňiz haýyrly", "ky": "күнүңүз жарык", "en": "good morning"},
    {"az": "təşəkkür edirəm", "tr": "teşekkür ederim", "kk": "рақмет", "uz": "rahmat", "tm": "sag bol", "ky": "рахмат", "en": "thank you"},
    {"az": "xoş gəlmisiniz", "tr": "hoş geldiniz", "kk": "қош келдіңіз", "uz": "xush kelibsiz", "tm": "hoş geldiňiz", "ky": "кош келиңиз", "en": "welcome"},
    {"az": "bəli", "tr": "evet", "kk": "иә", "uz": "ha", "tm": "hawa", "ky": "ооба", "en": "yes"},
    {"az": "xeyr", "tr": "hayır", "kk": "жоқ", "uz": "yo'q", "tm": "ýok", "ky": "жок", "en": "no"},
    {"az": "dost", "tr": "arkadaş", "kk": "дос", "uz": "do'st", "tm": "dost", "ky": "дос", "en": "friend"},
    {"az": "gənc", "tr": "genç", "kk": "жас", "uz": "yosh", "tm": "ýaş", "ky": "жаш", "en": "young"},
    {"az": "gənclər", "tr": "gençler", "kk": "жастар", "uz": "yoshlar", "tm": "ýaşlar", "ky": "жаштар", "en": "youth"},
    {"az": "layihə", "tr": "proje", "kk": "жоба", "uz": "loyiha", "tm": "taslama", "ky": "долбоор", "en": "project"},
    {"az": "komanda", "tr": "takım", "kk": "команда", "uz": "jamoa", "tm": "topar", "ky": "команда", "en": "team"},
    {"az": "dil", "tr": "dil", "kk": "тіл", "uz": "til", "tm": "dil", "ky": "тил", "en": "language"},
    {"az": "dünya", "tr": "dünya", "kk": "әлем", "uz": "dunyo", "tm": "dünýä", "ky": "дүйнө", "en": "world"},
    {"az": "gələcək", "tr": "gelecek", "kk": "болашақ", "uz": "kelajak", "tm": "geljek", "ky": "келечек", "en": "future"},
    {"az": "birlik", "tr": "birlik", "kk": "бірлік", "uz": "birlik", "tm": "birlik", "ky": "биримдик", "en": "unity"},
    {"az": "birlikdə", "tr": "birlikte", "kk": "бірге", "uz": "birga", "tm": "bile", "ky": "бирге", "en": "together"},
    {"az": "bu gün", "tr": "bugün", "kk": "бүгін", "uz": "bugun", "tm": "şu gün", "ky": "бүгүн", "en": "today"},
    {"az": "sabah", "tr": "yarın", "kk": "ертең", "uz": "ertaga", "tm": "ertir", "ky": "эртең", "en": "tomorrow"},
    {"az": "xəbər", "tr": "haber", "kk": "жаңалық", "uz": "yangilik", "tm": "habar", "ky": "жаңылык", "en": "news"},
    {"az": "iş", "tr": "iş", "kk": "жұмыс", "uz": "ish", "tm": "iş", "ky": "иш", "en": "work"},
    {"az": "tələbə", "tr": "öğrenci", "kk": "студент", "uz": "talaba", "tm": "okuwçy", "ky": "студент", "en": "student"},
    {"az": "universitet", "tr": "üniversite", "kk": "университет", "uz": "universitet", "tm": "uniwersitet", "ky": "университет", "en": "university"},
    {"az": "texnologiya", "tr": "teknoloji", "kk": "технология", "uz": "texnologiya", "tm": "tehnologiýa", "ky": "технология", "en": "technology"},
    {"az": "süni intellekt", "tr": "yapay zeka", "kk": "жасанды интеллект", "uz": "sun'iy intellekt", "tm": "emeli akyl", "ky": "жасалма интеллект", "en": "artificial intelligence"},
    {"az": "tərcümə", "tr": "çeviri", "kk": "аударма", "uz": "tarjima", "tm": "terjime", "ky": "котормо", "en": "translation"},
    {"az": "lüğət", "tr": "sözlük", "kk": "сөздік", "uz": "lug'at", "tm": "sözlük", "ky": "сөздүк", "en": "dictionary"},
    {"az": "axtarış", "tr": "arama", "kk": "іздеу", "uz": "qidiruv", "tm": "gözleg", "ky": "издөө", "en": "search"},
    {"az": "qoşul", "tr": "katıl", "kk": "қосыл", "uz": "qo'shil", "tm": "goşul", "ky": "кошул", "en": "join"},
    {"az": "paylaş", "tr": "paylaş", "kk": "бөліс", "uz": "ulash", "tm": "paýlaş", "ky": "бөлүш", "en": "share"},
    {"az": "bəyən", "tr": "beğen", "kk": "ұнату", "uz": "yoqtir", "tm": "hala", "ky": "жактыр", "en": "like"},
    {"az": "şərh", "tr": "yorum", "kk": "пікір", "uz": "izoh", "tm": "teswir", "ky": "пикир", "en": "comment"},
    {"az": "mesaj", "tr": "mesaj", "kk": "хабарлама", "uz": "xabar", "tm": "habar", "ky": "билдирүү", "en": "message"},
    {"az": "profil", "tr": "profil", "kk": "профиль", "uz": "profil", "tm": "profil", "ky": "профиль", "en": "profile"},
    {"az": "ayarlar", "tr": "ayarlar", "kk": "параметрлер", "uz": "sozlamalar", "tm": "sazlamalar", "ky": "жөндөөлөр", "en": "settings"},
    {"az": "orijinal", "tr": "orijinal", "kk": "түпнұсқа", "uz": "asl", "tm": "asyl", "ky": "түпнуска", "en": "original"},
    {"az": "tərcümə olunub", "tr": "çevrildi", "kk": "аударылды", "uz": "tarjima qilindi", "tm": "terjime edildi", "ky": "которулду", "en": "translated"},
    {"az": "canlı", "tr": "canlı", "kk": "тікелей", "uz": "jonli", "tm": "janly", "ky": "түз эфир", "en": "live"},
    {"az": "onlayn", "tr": "çevrimiçi", "kk": "онлайн", "uz": "onlayn", "tm": "onlaýn", "ky": "онлайн", "en": "online"},
    {"az": "oflayn", "tr": "çevrimdışı", "kk": "офлайн", "uz": "oflayn", "tm": "oflaýn", "ky": "офлайн", "en": "offline"},
    {"az": "bağlanılır", "tr": "bağlanıyor", "kk": "қосылуда", "uz": "ulanmoqda", "tm": "birikdirilýär", "ky": "туташууда", "en": "connecting"},
    {"az": "bağlantı kəsildi", "tr": "bağlantı kesildi", "kk": "байланыс үзілді", "uz": "aloqa uzildi", "tm": "baglanyşyk üzüldi", "ky": "байланыш үзүлдү", "en": "connection lost"},
    {"az": "yenidən qoşulur", "tr": "yeniden bağlanıyor", "kk": "қайта қосылуда", "uz": "qayta ulanmoqda", "tm": "täzeden birikdirilýär", "ky": "кайра туташууда", "en": "reconnecting"},
    {"az": "pantürk", "tr": "pan-türk", "kk": "пантүрік", "uz": "panturkiy", "tm": "pantürk", "ky": "пантүрк", "en": "pan-turkic"},
    {"az": "göytürk", "tr": "göktürk", "kk": "көктүрік", "uz": "ko'kturk", "tm": "göktürk", "ky": "көктүрк", "en": "gokturk"},
    {"az": "yenilik", "tr": "yenilik", "kk": "жаңалық", "uz": "yangilik", "tm": "täzelik", "ky": "жаңылык", "en": "innovation"},
    {"az": "rəqəmsal", "tr": "dijital", "kk": "цифрлық", "uz": "raqamli", "tm": "sanly", "ky": "санариптик", "en": "digital"},
    {"az": "məkan", "tr": "mekan", "kk": "кеңістік", "uz": "maydon", "tm": "giňişlik", "ky": "мейкиндик", "en": "space"},
    {"az": "gələcəyə", "tr": "geleceğe", "kk": "болашаққа", "uz": "kelajakka", "tm": "geljege", "ky": "келечекке", "en": "to the future"},
    {"az": "komandaya qoşul", "tr": "takıma katıl", "kk": "командаға қосыл", "uz": "jamoaga qo'shil", "tm": "topara goşul", "ky": "командага кошул", "en": "join the team"},
    {"az": "yeni layihə", "tr": "yeni proje", "kk": "жаңа жоба", "uz": "yangi loyiha", "tm": "täze taslama", "ky": "жаңы долбоор", "en": "new project"},
    {"az": "türk dövlətləri", "tr": "türk devletleri", "kk": "түрік мемлекеттері", "uz": "turkiy davlatlar", "tm": "türk döwletleri", "ky": "түрк мамлекеттери", "en": "turkic states"},
]


def _normalize_translation_lang(code: Optional[str]) -> str:
    value = (code or "").strip().lower()
    return TRANSLATION_LANG_ALIASES.get(value, value)


def _detect_translation_lang(raw: str) -> str:
    text = raw.lower()
    scores = {lang: 0 for lang in SUPPORTED_TRANSLATION_LANGS}

    for entry in TRANSLATION_LEXICON:
        for lang, term in entry.items():
            if not term:
                continue
            if re.search(r"(?<!\w)" + re.escape(term.lower()) + r"(?!\w)", text):
                scores[lang] += max(1, len(term.split()))

    if "ə" in text:
        scores["az"] += 3
    if any(ch in text for ch in "әғқңөұүһі"):
        scores["kk"] += 3
    if any(ch in text for ch in "ңөү"):
        scores["ky"] += 2
    if any(ch in text for ch in "äňşçöüýž"):
        scores["tm"] += 2
    if any(ch in text for ch in "ʻ‘ʼ"):
        scores["uz"] += 1
    if re.search(r"\b(the|and|is|are|you|we|this|that|with|for|from|have)\b", text):
        scores["en"] += 2

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "az"


def _match_translation_case(source: str, target: str) -> str:
    if source.isupper():
        return target.upper()
    if source[:1].isupper():
        return target[:1].upper() + target[1:]
    return target


def _lexicon_translate(text: str, source_lang: str, target_lang: str) -> str:
    if source_lang == target_lang:
        return text

    pairs = []
    for entry in TRANSLATION_LEXICON:
        source = entry.get(source_lang)
        target = entry.get(target_lang)
        if source and target and source.lower() != target.lower():
            pairs.append((source, target))

    pairs.sort(key=lambda pair: len(pair[0]), reverse=True)
    translated = text
    for source, target in pairs:
        pattern = re.compile(
            r"(?<!\w)" + re.escape(source) + r"(?!\w)",
            re.IGNORECASE,
        )
        translated = pattern.sub(
            lambda match, t=target: _match_translation_case(match.group(0), t),
            translated,
        )
    return translated


def _external_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    api_url = os.getenv("TRANSLATE_API_URL")
    api_key = os.getenv("TRANSLATE_API_KEY")
    if not api_url or not api_key:
        return None

    payload = json.dumps(
        {
            "model": os.getenv("TRANSLATE_MODEL", "gpt-4o-mini"),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a precise translator for Turkic languages. "
                        f"Translate the user text from {source_lang} to {target_lang}. "
                        "Return only the translation."
                    ),
                },
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
    ).encode("utf-8")
    request = urllib_request.Request(
        api_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib_request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    if isinstance(data, dict):
        if isinstance(data.get("translated_text"), str):
            return data["translated_text"].strip()
        if isinstance(data.get("translation"), str):
            return data["translation"].strip()
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
            content = message.get("content")
            if isinstance(content, str):
                return content.strip()
    return None


async def _external_translate(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    try:
        return await asyncio.to_thread(
            _external_translate_sync,
            text,
            source_lang,
            target_lang,
        )
    except Exception:
        logger.warning("External translation provider failed; using lexicon fallback", exc_info=True)
        return None


@app.post("/api/translate", response_model=schemas.TranslationResponse)
@app.post("/translate", response_model=schemas.TranslationResponse)
async def translate_text(payload: schemas.TranslationRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tərcümə üçün mətn tələb olunur",
        )

    target_lang = _normalize_translation_lang(payload.target_lang)
    if target_lang not in SUPPORTED_TRANSLATION_LANGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dəstəklənməyən hədəf dili",
        )

    source_lang = _normalize_translation_lang(payload.source_lang)
    if source_lang not in SUPPORTED_TRANSLATION_LANGS:
        source_lang = _detect_translation_lang(text)

    if source_lang == target_lang:
        return schemas.TranslationResponse(
            original_text=text,
            translated_text=text,
            source_lang=source_lang,
            target_lang=target_lang,
            provider="original",
        )

    external = await _external_translate(text, source_lang, target_lang)
    if external:
        return schemas.TranslationResponse(
            original_text=text,
            translated_text=external,
            source_lang=source_lang,
            target_lang=target_lang,
            provider="ai",
        )

    translated = _lexicon_translate(text, source_lang, target_lang)
    return schemas.TranslationResponse(
        original_text=text,
        translated_text=translated,
        source_lang=source_lang,
        target_lang=target_lang,
        provider="lexicon",
    )


# --- WEBSOCKET REAL-TIME CHAT ---

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        conns = self.rooms.get(room_id)
        if not conns:
            return
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self.rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, message: str):
        dead: List[WebSocket] = []
        for connection in list(self.rooms.get(room_id, [])):
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection, room_id)

manager = ConnectionManager()


def _ws_display_name(token: Optional[str], client_id: str, db: Session) -> str:
    if not token:
        return f"İstifadəçi #{client_id}"
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            return f"İstifadəçi #{client_id}"
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            return user.full_name or user.username or f"İstifadəçi #{client_id}"
    except JWTError:
        pass
    return f"İstifadəçi #{client_id}"


HEARTBEAT_INTERVAL = 15.0
HEARTBEAT_PING = '{"type":"ping"}'
HEARTBEAT_PONG = '{"type":"pong"}'


def _heartbeat_kind(raw: str) -> Optional[str]:
    text = raw.strip().lower()
    if text in {"ping", "pong"}:
        return text
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if isinstance(payload, dict) and payload.get("type") in {"ping", "pong"}:
        return payload["type"]
    return None


async def _ws_heartbeat(websocket: WebSocket):
    """Keep Render/proxy idle connections alive with a ping every 15 seconds."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await websocket.send_text(HEARTBEAT_PING)
    except asyncio.CancelledError:
        raise
    except Exception:
        # The receive loop owns disconnection cleanup.
        return


async def _chat_loop(websocket: WebSocket, room_id: str, client_id: str, token: Optional[str] = None):
    from database import SessionLocal
    db = SessionLocal()
    try:
        display = _ws_display_name(token, client_id, db)
    finally:
        db.close()

    await manager.connect(websocket, room_id)
    heartbeat_task = asyncio.create_task(_ws_heartbeat(websocket))
    await manager.broadcast(room_id, f"{display} söhbətə qoşuldu 🐺")
    try:
        while True:
            data = await websocket.receive_text()

            kind = _heartbeat_kind(data)
            if kind == "ping":
                await websocket.send_text(HEARTBEAT_PONG)
                continue
            if kind == "pong":
                # Client acknowledged our heartbeat; connection stays alive.
                continue

            await manager.broadcast(room_id, f"{display}: {data}")
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket chat loop failed for room %s", room_id)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except (asyncio.CancelledError, Exception):
            pass
        manager.disconnect(websocket, room_id)
        try:
            await manager.broadcast(room_id, f"{display} söhbətdən ayrıldı.")
        except Exception:
            logger.warning("Could not broadcast disconnect for room %s", room_id, exc_info=True)


@app.websocket("/api/ws/chat/global/{client_id}")
@app.websocket("/ws/chat/global/{client_id}")
async def websocket_global_endpoint(
    websocket: WebSocket,
    client_id: str,
    token: Optional[str] = Query(None),
):
    await _chat_loop(websocket, "global", client_id, token)


@app.websocket("/api/ws/chat/{room_id}/{client_id}")
@app.websocket("/ws/chat/{room_id}/{client_id}")
@app.websocket("/api/ws/chat/{room_id}")
@app.websocket("/ws/chat/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    client_id: str = "guest",
    token: Optional[str] = Query(None),
):
    known_rooms = {"az", "tr", "kk", "uz", "tm", "ky", "global"}
    has_client_path = "client_id" in websocket.path_params
    target_room = room_id

    if not has_client_path:
        if room_id in known_rooms:
            client_id = f"web-{uuid.uuid4().hex[:8]}"
        else:
            client_id = room_id or "guest"
            target_room = "global"

    await _chat_loop(websocket, target_room, client_id, token)


# --- HELPERS ---

def _follow_info(
    user: models.User,
    current_user: models.User,
    db: Session
) -> schemas.UserFollowInfo:
    followers_count = db.query(models.Follow).filter(models.Follow.followed_id == user.id).count()
    following_count = db.query(models.Follow).filter(models.Follow.follower_id == user.id).count()
    is_following = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.followed_id == user.id,
    ).first() is not None
    avatar = user.profile_picture or getattr(user, 'avatar_url', None)
    return schemas.UserFollowInfo(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        country=user.country,
        university=user.university,
        bio=user.bio,
        profile_picture=avatar,
        avatar_url=avatar,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following,
    )


def _follow_status(current_user_id: int, user_id: int, db: Session) -> schemas.FollowStatus:
    following = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user_id,
        models.Follow.followed_id == user_id,
    ).first() is not None
    followers = db.query(models.Follow).filter(models.Follow.followed_id == user_id).count()
    return schemas.FollowStatus(following=following, followers=followers)


def _story_response(s: models.Story) -> schemas.StoryResponse:
    return schemas.StoryResponse(
        id=s.id,
        user=schemas.UserResponse.model_validate(s.author) if s.author else schemas.UserResponse(id=0, full_name="", email=""),
        country=s.country,
        text=s.text,
        media_url=s.media_url,
        created_at=s.created_at,
    )