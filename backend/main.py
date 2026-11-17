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
from urllib import parse as urllib_parse
from urllib import request as urllib_request
import asyncio, base64, io, json, os, re, uuid, logging

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

TRANSLATION_CACHE: dict[tuple[str, str, str], schemas.TranslationResponse] = {}
MAX_TRANSLATION_CACHE_SIZE = 2048

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


# --- REAL-TIME NOTIFICATIONS MANAGER & HELPERS ---

class UserNotificationManager:
    def __init__(self):
        self.connections: dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        conns = self.connections.get(user_id)
        if not conns:
            return
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self.connections.pop(user_id, None)

    async def send_notification(self, user_id: int, payload: dict):
        conns = list(self.connections.get(user_id, []))
        if not conns:
            return
        message = json.dumps(payload, default=str)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

user_notification_manager = UserNotificationManager()


def push_user_notification(user_id: int, payload: dict) -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(user_notification_manager.send_notification(user_id, payload))
    except RuntimeError:
        try:
            asyncio.run(user_notification_manager.send_notification(user_id, payload))
        except Exception:
            logger.debug("Could not push WS notification to user %s", user_id)
    except Exception:
        logger.debug("Could not push WS notification to user %s", user_id)


def _serialize_notification(n: models.Notification, actor: Optional[models.User] = None) -> dict:
    actor_data = None
    if actor:
        actor_data = {
            "id": actor.id,
            "full_name": actor.full_name,
            "username": actor.username,
            "email": actor.email,
            "country": actor.country,
            "university": actor.university,
            "bio": actor.bio,
            "profile_picture": actor.profile_picture,
        }
    return {
        "id": n.id,
        "user_id": n.user_id,
        "actor_id": n.actor_id,
        "actor": actor_data,
        "type": n.type,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "content": n.content,
        "actor_name": actor.full_name if actor else None,
        "actor_avatar": actor.profile_picture if actor else None,
        "post_id": n.entity_id if n.entity_type == "post" else None,
        "message": n.content,
        "is_read": bool(n.is_read),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def create_notification(
    db: Session,
    user_id: int,
    actor_id: Optional[int],
    notif_type: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    content: Optional[str] = None,
) -> Optional[models.Notification]:
    if actor_id and user_id == actor_id:
        return None
    try:
        notif = models.Notification(
            user_id=user_id,
            actor_id=actor_id,
            type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            content=content,
            is_read=0,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)

        actor = db.query(models.User).filter(models.User.id == actor_id).first() if actor_id else None
        event = {
            "type": "notification",
            "notification": _serialize_notification(notif, actor),
        }
        push_user_notification(user_id, event)
        return notif
    except Exception:
        db.rollback()
        logger.exception("Failed to create notification for user %s", user_id)
        return None


# --- PROJECT HUB ENDPOINTS ---

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
@app.get("/projects", response_model=List[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    projects = _safe_list_query(
        lambda: db.query(models.Project).all(),
        db,
        "projects",
    )
    return [
        {
            **schemas.ProjectResponse.model_validate(project).model_dump(),
            "member_ids": [
                member.user_id
                for member in db.query(models.ProjectMember)
                .filter(models.ProjectMember.project_id == project.id)
                .all()
            ],
            "member_count": db.query(models.ProjectMember)
            .filter(models.ProjectMember.project_id == project.id)
            .count(),
        }
        for project in projects
    ]

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


@app.post("/api/projects/{project_id}/join")
@app.post("/projects/{project_id}/join")
def join_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Layihə tapılmadı")

    if project.owner_id == current_user.id:
        return {"status": "ok", "message": "Layihənin sahibisiniz", "joined": True}

    existing = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == current_user.id,
    ).first()

    if existing:
        return {"status": "ok", "message": "Artıq müraciət etmisiniz", "status_code": existing.status, "joined": True}

    member = models.ProjectMember(project_id=project.id, user_id=current_user.id, status="pending")
    db.add(member)
    db.commit()

    if project.owner_id and project.owner_id != current_user.id:
        create_notification(
            db=db,
            user_id=project.owner_id,
            actor_id=current_user.id,
            notif_type="project_join",
            entity_type="project",
            entity_id=project.id,
            content=project.title,
        )

    return {"status": "ok", "message": "Müraciət göndərildi", "joined": True}


@app.post("/api/projects/{project_id}/accept/{applicant_id}")
@app.post("/projects/{project_id}/accept/{applicant_id}")
def accept_project_member(
    project_id: int,
    applicant_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Layihə tapılmadı")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Yalnız layihə sahibi qəbul edə bilər")

    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == applicant_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müraciət tapılmadı")

    member.status = "accepted"
    db.commit()

    create_notification(
        db=db,
        user_id=applicant_id,
        actor_id=current_user.id,
        notif_type="project_accept",
        entity_type="project",
        entity_id=project.id,
        content=project.title,
    )

    return {"status": "ok", "message": "Müraciət qəbul edildi"}

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

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Şəkil boş ola bilməz")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Şəkil ölçüsü 5MB-dan böyük ola bilməz")

    media_type = file.content_type if file.content_type in {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    } else "image/jpeg"
    try:
        from PIL import Image

        with Image.open(io.BytesIO(content)) as image:
            image = image.convert("RGB")
            resampling = getattr(Image, "Resampling", Image)
            image.thumbnail((256, 256), resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=85, optimize=True)
            content = output.getvalue()
            media_type = "image/jpeg"
    except ImportError:
        logger.info("Pillow is unavailable; storing the uploaded avatar bytes unchanged")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Şəkil emal edilə bilmədi") from exc

    avatar_url = f"data:{media_type};base64,{base64.b64encode(content).decode('ascii')}"
    current_user.profile_picture = avatar_url

    db.commit()
    db.refresh(current_user)

    return {"status": "ok", "avatar_url": avatar_url, "url": avatar_url}


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

@app.get("/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
@app.get("/api/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
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
@app.get("/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
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
        create_notification(
            db=db,
            user_id=user_id,
            actor_id=current_user.id,
            notif_type="follow",
            entity_type="user",
            entity_id=current_user.id,
            content=current_user.full_name or current_user.username or "",
        )

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

def _post_response(post: models.Post, current_user: models.User, db: Session) -> schemas.PostResponse:
    liked = db.query(models.PostLike.id).filter(
        models.PostLike.post_id == post.id,
        models.PostLike.user_id == current_user.id,
    ).first() is not None
    is_saved = db.query(models.SavedPost.id).filter(
        models.SavedPost.post_id == post.id,
        models.SavedPost.user_id == current_user.id,
    ).first() is not None
    return schemas.PostResponse(
        id=post.id,
        user_id=post.user_id,
        body=post.body,
        image_url=post.image_url,
        file_url=post.file_url,
        file_name=post.file_name,
        likes_count=post.likes_count or 0,
        comments_count=post.comments_count or 0,
        is_liked=liked,
        liked_by_me=liked,
        source_lang=_detect_translation_lang(post.body or ""),
        is_saved=is_saved,
        created_at=post.created_at,
        author=schemas.UserResponse.model_validate(post.author) if post.author else None,
    )


@app.get("/api/posts", response_model=List[schemas.PostResponse])
@app.get("/api/posts/feed", response_model=List[schemas.PostResponse])
@app.get("/posts", response_model=List[schemas.PostResponse])
@app.get("/posts/feed", response_model=List[schemas.PostResponse])
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
            result.append(_post_response(p, current_user, db))
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
    return _post_response(post, current_user, db)


@app.get("/api/users/me/posts", response_model=List[schemas.PostResponse])
@app.get("/users/me/posts", response_model=List[schemas.PostResponse])
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
            result.append(_post_response(p, current_user, db))
        except Exception:
            logger.warning("Could not serialize post %s", getattr(p, "id", "?"), exc_info=True)
    return result


@app.get("/api/users/me/saved-posts", response_model=List[schemas.PostResponse])
@app.get("/api/posts/saved", response_model=List[schemas.PostResponse])
def saved_posts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    saved = db.query(models.SavedPost).filter(
        models.SavedPost.user_id == current_user.id,
    ).order_by(models.SavedPost.created_at.desc()).all()
    return [_post_response(item.post, current_user, db) for item in saved if item.post]


@app.post("/api/posts/{post_id}/save")
@app.post("/posts/{post_id}/save")
def save_post(
    post_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    existing = db.query(models.SavedPost).filter(
        models.SavedPost.user_id == current_user.id,
        models.SavedPost.post_id == post_id,
    ).first()
    if existing:
        db.delete(existing)
        is_saved = False
    else:
        db.add(models.SavedPost(user_id=current_user.id, post_id=post_id))
        is_saved = True
    db.commit()
    return {"is_saved": is_saved}


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
    existing = db.query(models.PostLike).filter(
        models.PostLike.post_id == post.id,
        models.PostLike.user_id == current_user.id,
    ).first()
    if existing:
        db.delete(existing)
        post.likes_count = max(0, (post.likes_count or 0) - 1)
        liked = False
    else:
        db.add(models.PostLike(post_id=post.id, user_id=current_user.id))
        post.likes_count = (post.likes_count or 0) + 1
        liked = True
    db.commit()

    if liked and post.user_id and post.user_id != current_user.id:
        create_notification(
            db=db,
            user_id=post.user_id,
            actor_id=current_user.id,
            notif_type="like",
            entity_type="post",
            entity_id=post.id,
            content=(post.body or "")[:80],
        )

    return {"liked": liked, "likes_count": post.likes_count or 0}


@app.get("/api/posts/{post_id}", response_model=schemas.PostResponse)
@app.get("/posts/{post_id}", response_model=schemas.PostResponse)
def get_post(post_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    return _post_response(post, current_user, db)


@app.post("/api/posts/{post_id}/comment")
@app.post("/posts/{post_id}/comment")
def comment_post(post_id: int, payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Rəy boş ola bilməz")

    comment = models.Comment(post_id=post.id, user_id=current_user.id, body=text)
    db.add(comment)
    post.comments_count = (post.comments_count or 0) + 1
    db.commit()

    if post.user_id and post.user_id != current_user.id:
        create_notification(
            db=db,
            user_id=post.user_id,
            actor_id=current_user.id,
            notif_type="comment",
            entity_type="post",
            entity_id=post.id,
            content=text[:100],
        )

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

    create_notification(
        db=db,
        user_id=payload.receiver_id,
        actor_id=current_user.id,
        notif_type="message",
        entity_type="message",
        entity_id=msg.id,
        content=msg.content[:100],
    )
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
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        q = db.query(models.Notification).filter(models.Notification.user_id == current_user.id)
        if unread_only:
            q = q.filter(models.Notification.is_read == 0)
        items = q.order_by(models.Notification.created_at.desc()).limit(limit).all()

        unread_count = db.query(models.Notification).filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == 0,
        ).count()

        serialized = [_serialize_notification(n, n.actor) for n in items]
        return {
            "unread_count": unread_count,
            "notifications": serialized,
            "items": serialized,
        }
    except Exception:
        logger.exception("Failed to fetch notifications for user %s", getattr(current_user, "id", "?"))
        return {
            "unread_count": 0,
            "notifications": [],
            "items": [],
        }


@app.patch("/api/notifications/read")
@app.post("/api/notifications/read")
@app.patch("/notifications/read")
@app.post("/notifications/read")
@app.post("/api/notifications/mark-all-read")
@app.post("/notifications/mark-all-read")
def mark_notifications_read(
    payload: Optional[dict] = Body(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = payload or {}
    notif_id = payload.get("id") or payload.get("notification_id")
    ids = payload.get("ids")

    if notif_id is not None:
        try:
            nid = int(notif_id)
            db.query(models.Notification).filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id == nid,
            ).update({"is_read": 1})
        except (ValueError, TypeError):
            pass
    elif ids and isinstance(ids, list):
        clean_ids = [int(i) for i in ids if isinstance(i, (int, str)) and str(i).isdigit()]
        if clean_ids:
            db.query(models.Notification).filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id.in_(clean_ids),
            ).update({"is_read": 1}, synchronize_session=False)
    else:
        # Mark all as read
        db.query(models.Notification).filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == 0,
        ).update({"is_read": 1}, synchronize_session=False)

    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


@app.patch("/api/notifications/{notification_id}/read")
@app.patch("/notifications/{notification_id}/read")
def mark_notification_read_by_id(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id,
    ).update({"is_read": 1})
    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


@app.post("/api/notifications/read-all")
@app.post("/notifications/read-all")
def mark_all_notifications_read_alias(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).update({"is_read": 1}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "unread_count": 0}


@app.patch("/api/notifications/{notification_id}/read")
@app.post("/api/notifications/{notification_id}/read")
@app.patch("/notifications/{notification_id}/read")
@app.post("/notifications/{notification_id}/read")
def mark_single_notification_read(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.id == notification_id,
    ).update({"is_read": 1})
    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


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
    "tk": "tm",
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
                        "Return only the translation. Preserve emojis, hashtags, URLs, line breaks, "
                        "mentions, and formatting exactly; translate the complete meaning naturally, "
                        "not word by word."
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


def _google_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    google_target = "tk" if target_lang == "tm" else target_lang
    query = urllib_parse.urlencode(
        {
            "client": "gtx",
            "sl": "auto",
            "tl": google_target,
            "dt": "t",
            "q": text,
        }
    )
    request = urllib_request.Request(
        f"https://translate.googleapis.com/translate_a/single?{query}",
        headers={"User-Agent": "TurkHub/1.0"},
        method="GET",
    )
    with urllib_request.urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    segments = data[0] if isinstance(data, list) and data else []
    translated = "".join(
        segment[0]
        for segment in segments
        if isinstance(segment, list) and segment and isinstance(segment[0], str)
    ).strip()
    return translated or None


def _mymemory_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    source = "auto" if not source_lang else ("tk" if source_lang == "tm" else source_lang)
    target = "tk" if target_lang == "tm" else target_lang
    query = urllib_parse.urlencode({"q": text, "langpair": f"{source}|{target}"})
    request = urllib_request.Request(
        f"https://api.mymemory.translated.net/get?{query}",
        headers={"User-Agent": "Mozilla/5.0 (TurkHub/1.0)"},
        method="GET",
    )
    with urllib_request.urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    response_data = data.get("responseData", {}) if isinstance(data, dict) else {}
    translated = response_data.get("translatedText") if isinstance(response_data, dict) else None
    return translated.strip() if isinstance(translated, str) else None


async def _external_translate(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    try:
        llm_result = await asyncio.to_thread(
            _external_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if llm_result and llm_result.strip() != text.strip():
            return llm_result.strip()
    except Exception as exc:
        logger.warning("LLM translation provider failed: %s", exc)
    try:
        google_result = await asyncio.to_thread(
            _google_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if google_result and google_result.strip() != text.strip():
            return google_result.strip()
    except Exception as exc:
        logger.warning("Google translation fallback failed: %s", exc)
    try:
        mymemory_result = await asyncio.to_thread(
            _mymemory_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if mymemory_result and mymemory_result.strip() != text.strip():
            return mymemory_result.strip()
    except Exception as exc:
        logger.warning("MyMemory translation fallback failed: %s", exc)
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

    cache_key = (text, source_lang, target_lang)
    cached = TRANSLATION_CACHE.get(cache_key)
    if cached:
        return cached

    external = await _external_translate(text, source_lang, target_lang)
    if external:
        result = schemas.TranslationResponse(
            original_text=text,
            translated_text=external,
            source_lang=source_lang,
            target_lang=target_lang,
            provider="ai",
        )
        if len(TRANSLATION_CACHE) >= MAX_TRANSLATION_CACHE_SIZE:
            TRANSLATION_CACHE.pop(next(iter(TRANSLATION_CACHE)))
        TRANSLATION_CACHE[cache_key] = result
        return result

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Tərcümə xidməti hazırda əlçatan deyil",
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


@app.websocket("/api/ws/notifications")
@app.websocket("/ws/notifications")
@app.websocket("/api/ws/notifications/{user_id}")
@app.websocket("/ws/notifications/{user_id}")
async def websocket_notifications_endpoint(
    websocket: WebSocket,
    user_id: Optional[str] = None,
    token: Optional[str] = Query(None),
):
    resolved_user_id: Optional[int] = None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        token_payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = token_payload.get("sub")
        if email:
            from database import SessionLocal
            db = SessionLocal()
            try:
                user = db.query(models.User).filter(models.User.email == email).first()
                if user:
                    resolved_user_id = user.id
            finally:
                db.close()
    except JWTError:
        resolved_user_id = None

    if resolved_user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if user_id:
        try:
            requested_user_id = int(user_id)
        except (ValueError, TypeError):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if requested_user_id != resolved_user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await user_notification_manager.connect(resolved_user_id, websocket)
    heartbeat_task = asyncio.create_task(_ws_heartbeat(websocket))
    try:
        while True:
            data = await websocket.receive_text()
            kind = _heartbeat_kind(data)
            if kind == "ping":
                await websocket.send_text(HEARTBEAT_PONG)
                continue
            if kind == "pong":
                continue
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket notifications error for user %s", resolved_user_id)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except (asyncio.CancelledError, Exception):
            pass
        user_notification_manager.disconnect(resolved_user_id, websocket)


# --- HELPERS ---

def _follow_info(
    user: models.User,
    current_user: models.User,
    db: Session
) -> schemas.UserFollowInfo:
    followers_count = db.query(models.Follow).filter(models.Follow.followed_id == user.id).count()
    following_count = db.query(models.Follow).filter(models.Follow.follower_id == user.id).count()
    posts_count = db.query(models.Post).filter(models.Post.user_id == user.id).count()
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
        role=user.university,
        bio=user.bio,
        profile_picture=avatar,
        avatar_url=avatar,
        followers_count=followers_count,
        following_count=following_count,
        posts_count=posts_count,
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