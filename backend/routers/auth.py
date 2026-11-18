import base64
import io
import logging
import os
from typing import Callable, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import ValidationError
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

import models
import schemas
from auth_utils import create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from db_utils import safe_first_query, safe_list_query
from media_utils import upload_to_cloudinary
from notification_service import create_notification

logger = logging.getLogger("turk_hub")

router = APIRouter(tags=["auth"])

# Database initialization callback to break circular dependency
_init_db_fn: Optional[Callable[[], bool]] = None


def set_init_db_fn(fn: Callable[[], bool]) -> None:
    global _init_db_fn
    _init_db_fn = fn


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

    if _init_db_fn and not _init_db_fn():
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
    identifier = (form_data.username or "").strip()
    identifier_clean = identifier.lstrip("@").strip()
    identifier_lower = identifier.lower()
    clean_lower = identifier_clean.lower()

    user = (
        db.query(models.User)
        .filter(
            or_(
                func.lower(models.User.email) == identifier_lower,
                func.lower(models.User.username) == clean_lower,
            )
        )
        .first()
    )
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yanlış e-poçt və ya şifrə",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


def follow_info(
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


def follow_status(current_user_id: int, user_id: int, db: Session) -> schemas.FollowStatus:
    following = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user_id,
        models.Follow.followed_id == user_id,
    ).first() is not None
    followers = db.query(models.Follow).filter(models.Follow.followed_id == user_id).count()
    return schemas.FollowStatus(following=following, followers=followers)


# --- REGISTRATION ---

@router.post("/api/auth/register", response_model=schemas.UserResponse)
@router.post("/register", response_model=schemas.UserResponse)
@router.post("/auth/register", response_model=schemas.UserResponse)
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


# --- LOGIN ---

@router.post("/api/auth/login", response_model=schemas.Token)
@router.post("/login", response_model=schemas.Token)
@router.post("/auth/login", response_model=schemas.Token)
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


# --- CURRENT USER ---

@router.get("/api/auth/me", response_model=schemas.UserResponse)
@router.get("/me", response_model=schemas.UserResponse)
@router.get("/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# --- USERS LIST & SEARCH ---

@router.get("/api/users", response_model=List[schemas.UserFollowInfo])
@router.get("/users", response_model=List[schemas.UserFollowInfo])
@router.get("/api/users/search", response_model=List[schemas.UserFollowInfo])
@router.get("/users/search", response_model=List[schemas.UserFollowInfo])
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
    users = safe_list_query(lambda: db_query.all(), db, "users")

    result = []
    for u in users:
        try:
            result.append(follow_info(u, current_user, db))
        except Exception:
            logger.warning("Could not serialize user %s", getattr(u, "id", "?"), exc_info=True)
    return result


@router.get("/api/users/profile", response_model=schemas.UserResponse)
@router.get("/users/profile", response_model=schemas.UserResponse)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.get("/api/users/by-username/{username}", response_model=schemas.UserFollowInfo)
@router.get("/users/by-username/{username}", response_model=schemas.UserFollowInfo)
@router.get("/api/users/username/{username}", response_model=schemas.UserFollowInfo)
@router.get("/users/username/{username}", response_model=schemas.UserFollowInfo)
def get_user_by_username(
    username: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean = username.strip().lstrip("@").lower()
    user = db.query(models.User).filter(models.User.username == clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    return follow_info(user, current_user, db)


@router.get("/api/users/{user_id}", response_model=schemas.UserFollowInfo)
@router.get("/users/{user_id}", response_model=schemas.UserFollowInfo)
def get_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    return follow_info(user, current_user, db)


@router.put("/api/users/profile", response_model=schemas.UserResponse)
@router.patch("/api/users/profile", response_model=schemas.UserResponse)
@router.put("/users/profile", response_model=schemas.UserResponse)
@router.patch("/users/profile", response_model=schemas.UserResponse)
@router.put("/api/users/me", response_model=schemas.UserResponse)
@router.patch("/api/users/me", response_model=schemas.UserResponse)
@router.put("/users/me", response_model=schemas.UserResponse)
@router.patch("/users/me", response_model=schemas.UserResponse)
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


@router.post("/api/users/upload-avatar")
@router.post("/users/upload-avatar")
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

    # Cloudinary persistent storage first (if configured)
    c_url = upload_to_cloudinary(content, file.filename or f"avatar_{current_user.id}.jpg", folder="turk_hub/avatars")
    if c_url:
        current_user.profile_picture = c_url
        db.commit()
        db.refresh(current_user)
        return {"status": "ok", "avatar_url": c_url, "url": c_url}

    # Fallback to local optimized base64 data URI (never lost across Render restarts)
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


# --- FOLLOW / UNFOLLOW ---

@router.get("/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
@router.get("/api/users/{user_id}/followers", response_model=List[schemas.UserFollowInfo])
def list_followers(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    follows = safe_list_query(
        lambda: db.query(models.Follow).filter(models.Follow.followed_id == user_id).all(),
        db,
        "followers",
    )
    users = []
    for f in follows:
        u = safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == f.follower_id).first(),
            db,
            "follower user",
        )
        if u:
            try:
                users.append(follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize follower %s", getattr(u, "id", "?"), exc_info=True)
    return users


@router.get("/api/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
@router.get("/users/{user_id}/following", response_model=List[schemas.UserFollowInfo])
def list_following(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    follows = safe_list_query(
        lambda: db.query(models.Follow).filter(models.Follow.follower_id == user_id).all(),
        db,
        "following",
    )
    users = []
    for f in follows:
        u = safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == f.followed_id).first(),
            db,
            "following user",
        )
        if u:
            try:
                users.append(follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize following %s", getattr(u, "id", "?"), exc_info=True)
    return users


@router.post("/api/users/{user_id}/follow", response_model=schemas.FollowStatus)
@router.post("/users/{user_id}/follow", response_model=schemas.FollowStatus)
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

    return follow_status(current_user.id, user_id, db)


@router.delete("/api/users/{user_id}/follow", response_model=schemas.FollowStatus)
@router.delete("/users/{user_id}/follow", response_model=schemas.FollowStatus)
def unfollow_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")

    db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.followed_id == user_id,
    ).delete()
    db.commit()

    return follow_status(current_user.id, user_id, db)
