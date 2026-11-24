from datetime import timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
import schemas
from auth_utils import get_current_user
from database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def admin_required(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not bool(current_user.is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user


def utc_datetime(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/stats", response_model=schemas.AdminStatsResponse)
def platform_stats(
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    return schemas.AdminStatsResponse(
        total_users=db.query(models.User).count(),
        individual_users=db.query(models.User).filter(models.User.account_type == "individual").count(),
        organization_users=db.query(models.User).filter(models.User.account_type == "organization").count(),
        verified_organizations=db.query(models.User).filter(
            models.User.account_type == "organization",
            models.User.is_verified.is_(True),
        ).count(),
        total_posts=db.query(models.Post).count(),
        total_comments=db.query(models.Comment).count(),
        pending_news=db.query(models.News).filter(models.News.status == "pending").count(),
        approved_news=db.query(models.News).filter(models.News.status == "approved").count(),
        total_projects=db.query(models.Project).count(),
    )


@router.get("/news/pending")
def news_moderation_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    query = db.query(models.News)
    if status_filter != "all":
        query = query.filter(models.News.status == "pending")
    items = query.order_by(models.News.created_at.desc()).all()
    result = []
    for item in items:
        result.append({
            "id": item.id,
            "title": item.title,
            "content": item.content,
            "category": item.category,
            "cover_image_url": item.cover_image_url,
            "status": item.status,
            "is_pinned": bool(item.is_pinned),
            "author_id": item.author_id,
            "created_at": utc_datetime(item.created_at),
            "author": {
                "id": item.author.id,
                "username": item.author.username,
                "full_name": item.author.full_name,
                "email": item.author.email,
                "org_name": item.author.org_name,
                "account_type": item.author.account_type,
                "is_verified": bool(item.author.is_verified),
                "is_admin": bool(item.author.is_admin),
                "avatar_url": item.author.avatar_url,
                "country": item.author.country,
            } if item.author else None,
        })
    return result


@router.patch("/news/{news_id}")
def update_news(
    news_id: int,
    payload: schemas.AdminNewsUpdate,
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="News not found")
    if payload.status is not None:
        item.status = payload.status
    if payload.is_pinned is not None:
        item.is_pinned = payload.is_pinned
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "status": item.status,
        "is_pinned": bool(item.is_pinned),
    }


@router.get("/users", response_model=List[schemas.AdminUserResponse])
def admin_users(
    account_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    query = db.query(models.User)
    if account_type:
        query = query.filter(models.User.account_type == account_type)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            models.User.full_name.ilike(term),
            models.User.username.ilike(term),
            models.User.email.ilike(term),
            models.User.org_name.ilike(term),
        ))
    users = query.order_by(models.User.created_at.desc()).all()
    return [
        schemas.AdminUserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            org_name=user.org_name,
            account_type=user.account_type or "individual",
            is_verified=bool(user.is_verified),
            is_admin=bool(user.is_admin),
            country=user.country,
            created_at=utc_datetime(user.created_at),
            avatar_url=user.avatar_url,
        )
        for user in users
    ]


@router.patch("/users/{user_id}/verify")
def toggle_user_verification(
    user_id: int,
    payload: dict,
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "is_verified" in payload:
        user.is_verified = bool(payload["is_verified"])
    else:
        user.is_verified = not bool(user.is_verified)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "is_verified": bool(user.is_verified)}


@router.get("/posts")
def admin_posts(
    limit: int = Query(100, ge=1, le=200),
    admin: models.User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    posts = db.query(models.Post).order_by(models.Post.created_at.desc()).limit(limit).all()
    result = []
    for post in posts:
        result.append({
            "id": post.id,
            "user_id": post.user_id,
            "body": post.body,
            "image_url": post.image_url,
            "file_url": post.file_url,
            "file_name": post.file_name,
            "likes_count": db.query(models.PostLike).filter(models.PostLike.post_id == post.id).count(),
            "comments_count": db.query(models.Comment).filter(models.Comment.post_id == post.id).count(),
            "created_at": utc_datetime(post.created_at),
            "author": {
                "id": post.author.id,
                "username": post.author.username,
                "full_name": post.author.full_name,
                "email": post.author.email,
                "org_name": post.author.org_name,
                "account_type": post.author.account_type,
                "is_verified": bool(post.author.is_verified),
                "is_admin": bool(post.author.is_admin),
                "avatar_url": post.author.avatar_url,
                "country": post.author.country,
            } if post.author else None,
        })
    return result
