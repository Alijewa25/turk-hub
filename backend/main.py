from fastapi import FastAPI, Depends, Query, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import os, uuid

import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Türk Youth Hub API",
    description="Backend API for Turkic Youth Social Innovation Platform",
    version="1.0.0"
)

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
@app.get("/dictionary", response_model=List[schemas.DictionaryResponse])
def search_dictionary(
    q: Optional[str] = Query(None, description="Axtarış sözü"),
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
    return query.all()

# --- AUTHENTICATION ENDPOINTS ---

from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from auth_utils import (
    ALGORITHM,
    SECRET_KEY,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

# --- PROJECT HUB ENDPOINTS ---

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
@app.get("/projects", response_model=List[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).all()

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
        owner_id=current_user.id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

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


@app.websocket("/ws/chat/{room_id}/{client_id}")
async def websocket_room_endpoint(
    websocket: WebSocket,
    room_id: str,
    client_id: str,
    token: Optional[str] = Query(None),
):
    await _chat_loop(websocket, room_id, client_id, token)


@app.websocket("/ws/chat/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,
    token: Optional[str] = Query(None),
):
    await _chat_loop(websocket, "global", client_id, token)

@app.post("/api/auth/register", response_model=schemas.UserResponse)
@app.post("/register", response_model=schemas.UserResponse)
@app.post("/auth/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
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

    # Create new user
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

@app.post("/api/auth/login", response_model=schemas.Token)
@app.post("/login", response_model=schemas.Token)
@app.post("/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yanlış e-poçt və ya şifrə",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=schemas.UserResponse)
@app.get("/me", response_model=schemas.UserResponse)
@app.get("/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# --- USER PROFILE ENDPOINTS ---

@app.get("/api/users", response_model=List[schemas.UserFollowInfo])
def list_users(
    exclude_self: bool = True,
    q: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bütün istifadəçiləri (tövsiyələr üçün) izləmə vəziyyəti ilə qaytarır."""
    query = db.query(models.User)
    if exclude_self:
        query = query.filter(models.User.id != current_user.id)
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            (models.User.full_name.ilike(pattern)) |
            (models.User.username.ilike(pattern)) |
            (models.User.email.ilike(pattern))
        )
    users = query.all()

    result = []
    for u in users:
        result.append(_follow_info(u, current_user, db))
    return result


@app.get("/api/users/{user_id}", response_model=schemas.UserFollowInfo)
def get_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    return _follow_info(user, current_user, db)


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
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/api/upload")
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="İcazə verilməyən fayl formatı")

    max_bytes = 5 * 1024 * 1024  # 5MB
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
    posts = db.query(models.Post).order_by(models.Post.created_at.desc()).limit(limit).all()
    result = []
    for p in posts:
        result.append(schemas.PostResponse(
            id=p.id,
            user_id=p.user_id,
            body=p.body,
            image_url=p.image_url,
            file_url=p.file_url,
            file_name=p.file_name,
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
        created_at=post.created_at,
        author=schemas.UserResponse.model_validate(current_user),
    )


@app.get("/api/users/{user_id}/posts", response_model=List[schemas.PostResponse])
def user_posts(user_id: int, db: Session = Depends(get_db)):
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
            created_at=p.created_at,
            author=schemas.UserResponse.model_validate(p.author) if p.author else None,
        ))
    return result


# --- MESSAGES (DM) ---

@app.get("/api/messages/conversations")
def conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    sent = db.query(models.Message.receiver_id).filter(models.Message.sender_id == current_user.id).distinct().all()
    received = db.query(models.Message.sender_id).filter(models.Message.receiver_id == current_user.id).distinct().all()
    ids = set([s[0] for s in sent] + [r[0] for r in received])
    users = []
    for uid in ids:
        u = db.query(models.User).filter(models.User.id == uid).first()
        if u:
            users.append(schemas.UserResponse.model_validate(u))
    return users


@app.get("/api/messages/{user_id}", response_model=List[schemas.MessageResponse])
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
    if payload.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Özünüzə mesaj göndərə bilməzsiniz")
    receiver = db.query(models.User).filter(models.User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Alıcı tapılmadı")
    if not (payload.content or "").strip():
        raise HTTPException(status_code=400, detail="Mesaj boş ola bilməz")
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
    return schemas.UserFollowInfo(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        country=user.country,
        university=user.university,
        bio=user.bio,
        profile_picture=user.profile_picture,
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
