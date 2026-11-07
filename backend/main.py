from fastapi import Body, FastAPI, Depends, Query, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session
from pydantic import ValidationError
from contextlib import asynccontextmanager
from typing import Any, List, Optional
import os, uuid, logging

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


def sync_db_schema(engine) -> None:
    """Add missing columns to older PostgreSQL deployments."""
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'username'
                    ) THEN
                        ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'avatar_url'
                    ) THEN
                        ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'bio'
                    ) THEN
                        ALTER TABLE users ADD COLUMN bio TEXT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'country'
                    ) THEN
                        ALTER TABLE users ADD COLUMN country VARCHAR(100);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'university'
                    ) THEN
                        ALTER TABLE users ADD COLUMN university VARCHAR(255);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'profile_picture'
                    ) THEN
                        ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'users'
                          AND column_name = 'created_at'
                    ) THEN
                        ALTER TABLE users ADD COLUMN created_at TIMESTAMP;
                    END IF;
                END $$;
                """
            )
        )

        preparer = engine.dialect.identifier_preparer
        model_tables = (
            models.User.__table__,
            models.Project.__table__,
            models.Post.__table__,
            models.Message.__table__,
            models.Dictionary.__table__,
            models.Comment.__table__,
        )
        for table in model_tables:
            table_name = preparer.quote(table.name)
            for column in table.columns:
                if column.primary_key:
                    continue
                if (
                    not column.nullable
                    and column.default is None
                    and column.server_default is None
                ):
                    continue
                column_name = preparer.quote(column.name)
                column_type = column.type.compile(dialect=engine.dialect)
                unique = " UNIQUE" if column.unique else ""
                conn.execute(
                    text(
                        f"ALTER TABLE IF EXISTS {table_name} "
                        f"ADD COLUMN IF NOT EXISTS {column_name} {column_type}{unique}"
                    )
                )


def init_db() -> bool:
    """Create missing tables, reconcile old PostgreSQL schemas, and verify the DB."""
    try:
        models.Base.metadata.create_all(bind=engine)
        sync_db_schema(engine)
        logger.info("Database schema verified/created successfully")
        return True
    except Exception:
        logger.exception("Database initialization failed")
        return False


# Try at import time for environments that do not run the ASGI lifespan.
init_db()


@asynccontextmanager
async def lifespan(_: FastAPI):
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
    return _cors_error_response(
        request,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {"detail": "Daxili server xətası"},
    )


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
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
            (models.Dictionary.tm_val.ilike(search_pattern))
        )
    results = query.all()
    return results


@app.get("/api/dictionary/compare")
def dictionary_compare(
    q: str = Query(...),
    db: Session = Depends(get_db)
):
    search_pattern = f"%{q}%"
    items = db.query(models.Dictionary).filter(
        (models.Dictionary.root_concept.ilike(search_pattern)) |
        (models.Dictionary.az_val.ilike(search_pattern)) |
        (models.Dictionary.tr_val.ilike(search_pattern)) |
        (models.Dictionary.kk_val.ilike(search_pattern)) |
        (models.Dictionary.uz_val.ilike(search_pattern)) |
        (models.Dictionary.ky_val.ilike(search_pattern)) |
        (models.Dictionary.tm_val.ilike(search_pattern))
    ).all()
    comparison = []
    for item in items:
        comparison.append({
            "root": item.root_concept,
            "forms": {
                "az": item.az_val,
                "tr": item.tr_val,
                "kk": item.kk_val,
                "uz": item.uz_val,
                "ky": item.ky_val,
                "tm": item.tm_val,
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
        az_val=entry.az_val,
        tr_val=entry.tr_val,
        kk_val=entry.kk_val,
        uz_val=entry.uz_val,
        ky_val=entry.ky_val,
        tm_val=entry.tm_val,
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("%s query failed; attempting schema repair", label)

    if not init_db():
        return []

    try:
        return operation()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("%s query failed after schema repair", label)
        return []


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
    users = db_query.all()

    result = []
    for u in users:
        result.append(_follow_info(u, current_user, db))
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
    follows = db.query(models.Follow).filter(models.Follow.followed_id == user_id).all()
    users = []
    for f in follows:
        u = db.query(models.User).filter(models.User.id == f.follower_id).first()
        if u:
            users.append(_follow_info(u, current_user, db))
    return users


@app.get("/api/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
def list_following(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    follows = db.query(models.Follow).filter(models.Follow.follower_id == user_id).all()
    users = []
    for f in follows:
        u = db.query(models.User).filter(models.User.id == f.followed_id).first()
        if u:
            users.append(_follow_info(u, current_user, db))
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
    posts = db.query(models.Post).filter(models.Post.user_id == user_id).order_by(models.Post.created_at.desc()).all()
    result = []
    for p in posts:
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
    sent = db.query(models.Message.receiver_id).filter(models.Message.sender_id == current_user.id).distinct().all()
    received = db.query(models.Message.sender_id).filter(models.Message.receiver_id == current_user.id).distinct().all()
    ids = set([s[0] for s in sent] + [r[0] for r in received])
    users = []
    for uid in ids:
        u = db.query(models.User).filter(models.User.id == uid).first()
        if u:
            users.append(_follow_info(u, current_user, db))
    return users


@app.get("/api/messages/{user_id}", response_model=List[schemas.MessageResponse])
@app.get("/messages/{user_id}", response_model=List[schemas.MessageResponse])
def get_messages(user_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = db.query(models.Message).filter(
        ((models.Message.sender_id == current_user.id) & (models.Message.receiver_id == user_id)) |
        ((models.Message.sender_id == user_id) & (models.Message.receiver_id == current_user.id))
    ).order_by(models.Message.created_at.asc()).all()
    result = []
    for m in msgs:
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
    stories = db.query(models.Story).order_by(
        models.Story.created_at.desc()
    ).limit(limit).all()
    return [_story_response(s) for s in stories]


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


async def _chat_loop(websocket: WebSocket, room_id: str, client_id: str, token: Optional[str] = None):
    from database import SessionLocal
    db = SessionLocal()
    try:
        display = _ws_display_name(token, client_id, db)
    finally:
        db.close()

    await manager.connect(websocket, room_id)
    await manager.broadcast(room_id, f"{display} söhbətə qoşuldu 🐺")
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(room_id, f"{display}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        await manager.broadcast(room_id, f"{display} söhbətdən ayrıldı.")


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