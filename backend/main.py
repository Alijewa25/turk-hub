from fastapi import FastAPI, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Türk Youth Hub API",
    description="Backend API for Turkic Youth Social Innovation Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Türk Youth Hub API işləyir! 🐺",
        "version": "1.0.0"
    }

# --- DICTIONARY ENDPOINTS ---

@app.get("/api/dictionary")
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
            (models.Dictionary.tr_val.ilike(search_pattern))
        )
    return query.all()

# --- PROJECT HUB ENDPOINTS ---

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).all()

@app.post("/api/projects", response_model=schemas.ProjectResponse)
def create_project(
    project: schemas.ProjectCreate, 
    db: Session = Depends(get_db)
):
    db_project = models.Project(
        title=project.title,
        description=project.description,
        required_skills=project.required_skills,
        owner_id=1
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

# --- WEBSOCKET REAL-TIME CHAT ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/chat/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)
    await manager.broadcast(f"İstifadəçi #{client_id} söhbətə qoşuldu 🐺")
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"İstifadəçi #{client_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"İstifadəçi #{client_id} söhbətdən ayrıldı.")
# --- AUTHENTICATION ENDPOINTS ---

from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from auth_utils import hash_password, verify_password, create_access_token, get_current_user

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
    
    # Create new user
    hashed_password = hash_password(user.password)
    db_user = models.User(
        full_name=user.full_name,
        email=user.email,
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
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bütün istifadəçiləri (tövsiyələr üçün) izləmə vəziyyəti ilə qaytarır."""
    query = db.query(models.User)
    if exclude_self:
        query = query.filter(models.User.id != current_user.id)
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
    if payload.country is not None:
        current_user.country = payload.country
    if payload.university is not None:
        current_user.university = payload.university
    if payload.bio is not None:
        current_user.bio = payload.bio
    db.commit()
    db.refresh(current_user)
    return current_user


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
        user=schemas.UserResponse.model_validate(s.author),
        country=s.country,
        text=s.text,
        media_url=s.media_url,
        created_at=s.created_at,
    )
