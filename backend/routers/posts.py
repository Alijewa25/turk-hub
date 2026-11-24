import base64
import io
import logging
import os
import uuid
from typing import Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from auth_utils import get_current_user
from database import get_db
from db_utils import safe_list_query
from media_utils import UPLOAD_DIR, ensure_upload_dir, upload_to_cloudinary
from notification_service import create_notification
from translation_service import detect_translation_lang

logger = logging.getLogger("turk_hub")

router = APIRouter(tags=["posts"])


def utc_datetime(value):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def post_response(post: models.Post, current_user: models.User, db: Session) -> schemas.PostResponse:
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
        source_lang=detect_translation_lang(post.body or ""),
        is_saved=is_saved,
        created_at=utc_datetime(post.created_at),
        author=schemas.UserResponse.model_validate(post.author) if post.author else None,
    )


def story_response(s: models.Story) -> schemas.StoryResponse:
    return schemas.StoryResponse(
        id=s.id,
        user=schemas.UserResponse.model_validate(s.author) if s.author else schemas.UserResponse(id=0, full_name="", email=""),
        country=s.country,
        text=s.text,
        media_url=s.media_url,
        created_at=s.created_at,
    )


# --- POST FEED & CRUD ---

@router.get("/api/posts", response_model=List[schemas.PostResponse])
@router.get("/api/posts/feed", response_model=List[schemas.PostResponse])
@router.get("/posts", response_model=List[schemas.PostResponse])
@router.get("/posts/feed", response_model=List[schemas.PostResponse])
def list_posts(
    limit: int = Query(100, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    posts = safe_list_query(
        lambda: db.query(models.Post).order_by(models.Post.created_at.desc()).limit(limit).all(),
        db,
        "posts",
    )
    result = []
    for p in posts:
        try:
            result.append(post_response(p, current_user, db))
        except Exception:
            logger.warning("Could not serialize post %s", getattr(p, "id", "?"), exc_info=True)
    return result


@router.post("/api/posts", response_model=schemas.PostResponse)
@router.post("/posts", response_model=schemas.PostResponse)
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
    return post_response(post, current_user, db)


@router.get("/api/users/me/posts", response_model=List[schemas.PostResponse])
@router.get("/users/me/posts", response_model=List[schemas.PostResponse])
@router.get("/api/users/{user_id}/posts", response_model=List[schemas.PostResponse])
@router.get("/users/{user_id}/posts", response_model=List[schemas.PostResponse])
def user_posts(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    posts = safe_list_query(
        lambda: db.query(models.Post).filter(models.Post.user_id == user_id).order_by(models.Post.created_at.desc()).all(),
        db,
        "user posts",
    )
    result = []
    for p in posts:
        try:
            result.append(post_response(p, current_user, db))
        except Exception:
            logger.warning("Could not serialize post %s", getattr(p, "id", "?"), exc_info=True)
    return result


@router.get("/api/users/me/saved-posts", response_model=List[schemas.PostResponse])
@router.get("/api/posts/saved", response_model=List[schemas.PostResponse])
def saved_posts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    saved = db.query(models.SavedPost).filter(
        models.SavedPost.user_id == current_user.id,
    ).order_by(models.SavedPost.created_at.desc()).all()
    return [post_response(item.post, current_user, db) for item in saved if item.post]


@router.post("/api/posts/{post_id}/save")
@router.post("/posts/{post_id}/save")
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


@router.post("/api/posts/{post_id}/like")
@router.post("/posts/{post_id}/like")
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


@router.get("/api/posts/{post_id}", response_model=schemas.PostResponse)
@router.get("/posts/{post_id}", response_model=schemas.PostResponse)
def get_post(post_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    return post_response(post, current_user, db)


def comment_response(comment: models.Comment) -> dict:
    author = schemas.UserResponse.model_validate(comment.author) if comment.author else None
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "parent_id": comment.parent_id,
        "text": comment.body,
        "body": comment.body,
        "created_at": utc_datetime(comment.created_at),
        "author": author,
        "replies": [],
    }


@router.delete("/api/posts/{post_id}")
@router.delete("/posts/{post_id}")
def delete_post(post_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    if post.user_id != current_user.id and not bool(current_user.is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    db.query(models.Comment).filter(models.Comment.post_id == post_id).delete(synchronize_session=False)
    db.query(models.PostLike).filter(models.PostLike.post_id == post_id).delete(synchronize_session=False)
    db.query(models.SavedPost).filter(models.SavedPost.post_id == post_id).delete(synchronize_session=False)
    db.delete(post)
    db.commit()
    return {"status": "ok", "deleted": True}


@router.get("/api/posts/{post_id}/likes", response_model=List[schemas.UserResponse])
@router.get("/posts/{post_id}/likes", response_model=List[schemas.UserResponse])
def list_post_likes(post_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    likes = db.query(models.PostLike).filter(models.PostLike.post_id == post_id).order_by(models.PostLike.created_at.desc()).all()
    return [like.user for like in likes if like.user]


@router.post("/api/posts/{post_id}/comments")
@router.post("/api/posts/{post_id}/comment")
@router.post("/posts/{post_id}/comments")
@router.post("/posts/{post_id}/comment")
def comment_post(post_id: int, payload: schemas.CommentCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    text = (payload.text if payload.text is not None else payload.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Rəy boş ola bilməz")

    if payload.parent_id is not None:
        parent = db.query(models.Comment).filter(models.Comment.id == payload.parent_id, models.Comment.post_id == post.id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Cavablandırılan rəy tapılmadı")

    comment = models.Comment(post_id=post.id, user_id=current_user.id, parent_id=payload.parent_id, body=text)
    db.add(comment)
    post.comments_count = (post.comments_count or 0) + 1
    db.commit()
    db.refresh(comment)

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

    return {"status": "ok", "comments_count": post.comments_count, "comment": comment_response(comment)}


@router.get("/api/posts/{post_id}/comments", response_model=List[schemas.CommentResponse])
@router.get("/posts/{post_id}/comments", response_model=List[schemas.CommentResponse])
def list_post_comments(post_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post tapılmadı")
    comments = db.query(models.Comment).filter(models.Comment.post_id == post_id).order_by(models.Comment.created_at.asc()).all()
    by_id = {comment.id: comment_response(comment) for comment in comments}
    roots = []
    for comment in comments:
        item = by_id[comment.id]
        if comment.parent_id and comment.parent_id in by_id:
            by_id[comment.parent_id]["replies"].append(item)
        else:
            roots.append(item)
    return roots


@router.delete("/api/comments/{comment_id}")
@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Rəy tapılmadı")
    if comment.user_id != current_user.id and not bool(current_user.is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    pending = [comment.id]
    deleted_ids = set(pending)
    while pending:
        child_ids = [row.id for row in db.query(models.Comment).filter(models.Comment.parent_id.in_(pending)).all()]
        if not child_ids:
            break
        deleted_ids.update(child_ids)
        pending = child_ids
    deleted_count = len(deleted_ids)
    db.query(models.Comment).filter(models.Comment.id.in_(deleted_ids)).delete(synchronize_session=False)
    post = db.query(models.Post).filter(models.Post.id == comment.post_id).first()
    if post:
        post.comments_count = max(0, (post.comments_count or 0) - deleted_count)
    db.commit()
    return {"status": "ok", "deleted": True}


# --- MEDIA UPLOAD ---

@router.post("/api/upload")
@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="İcazə verilməyən fayl formatı")

    max_bytes = 5 * 1024 * 1024
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fayl boş ola bilməz")
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail="Fayl ölçüsü 5MB-dan böyük ola bilməz")

    # 1. Cloudinary upload if configured (persistent across Render restarts)
    c_url = upload_to_cloudinary(content, file.filename or f"upload_{uuid.uuid4().hex}{ext}", folder="turk_hub/uploads")
    if c_url:
        return {"url": c_url, "file_url": c_url, "filename": file.filename}

    # 2. For image files without Cloudinary, store compressed base64 data URI so media persists across ephemeral restarts
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} and len(content) <= 2 * 1024 * 1024:
        media_type = file.content_type or ("image/jpeg" if ext in {".jpg", ".jpeg"} else f"image/{ext.lstrip('.')}")
        try:
            from PIL import Image
            with Image.open(io.BytesIO(content)) as image:
                if image.mode in ("RGBA", "P"):
                    image = image.convert("RGB")
                resampling = getattr(Image, "Resampling", Image)
                image.thumbnail((1200, 1200), resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=80, optimize=True)
                opt_content = output.getvalue()
                data_uri = f"data:image/jpeg;base64,{base64.b64encode(opt_content).decode('ascii')}"
                return {"url": data_uri, "file_url": data_uri, "filename": file.filename}
        except Exception:
            pass

    # 3. Fallback to local /uploads directory
    ensure_upload_dir()
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as buffer:
        buffer.write(content)
    return {"url": f"/uploads/{fname}", "file_url": f"/uploads/{fname}", "filename": file.filename}


# --- STORIES ---

@router.get("/api/stories/feed", response_model=List[schemas.StoryResponse])
@router.get("/stories/feed", response_model=List[schemas.StoryResponse])
def story_feed(
    limit: int = Query(50, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stories = safe_list_query(
        lambda: db.query(models.Story).order_by(
            models.Story.created_at.desc()
        ).limit(limit).all(),
        db,
        "stories",
    )
    result = []
    for story in stories:
        try:
            result.append(story_response(story))
        except Exception:
            logger.warning("Could not serialize story %s", getattr(story, "id", "?"), exc_info=True)
    return result


@router.post("/api/stories", response_model=schemas.StoryResponse)
@router.post("/stories", response_model=schemas.StoryResponse)
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
    return story_response(story)
