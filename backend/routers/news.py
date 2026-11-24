from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth_utils import get_current_user
from database import get_db

router = APIRouter(tags=["news"])


def news_response(item: models.News) -> schemas.NewsResponse:
    created_at = item.created_at
    if created_at is not None and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return schemas.NewsResponse(
        id=item.id,
        title=item.title,
        content=item.content,
        category=item.category,
        cover_image_url=item.cover_image_url,
        status=item.status,
        is_pinned=bool(item.is_pinned),
        author_id=item.author_id,
        created_at=created_at,
        author=schemas.UserResponse.model_validate(item.author) if item.author else None,
    )


@router.get("/api/news", response_model=List[schemas.NewsResponse])
@router.get("/news", response_model=List[schemas.NewsResponse])
def approved_news(db: Session = Depends(get_db)):
    items = db.query(models.News).filter(models.News.status == "approved").order_by(
        models.News.is_pinned.desc(),
        models.News.created_at.desc(),
    ).all()
    return [news_response(item) for item in items]


@router.get("/api/news/my-submissions", response_model=List[schemas.NewsResponse])
@router.get("/news/my-submissions", response_model=List[schemas.NewsResponse])
def my_news_submissions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(models.News).filter(models.News.author_id == current_user.id).order_by(
        models.News.created_at.desc()
    ).all()
    return [news_response(item) for item in items]


@router.post("/api/news", response_model=schemas.NewsResponse)
@router.post("/news", response_model=schemas.NewsResponse)
def submit_news(
    payload: schemas.NewsCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = payload.title.strip()
    content = payload.content.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    allowed_categories = {"General", "Forum", "Scholarship", "Hackathon", "Internship", "Cultural", "Platform Update"}
    category = payload.category if payload.category in allowed_categories else "General"
    item = models.News(
        title=title,
        content=content,
        category=category,
        cover_image_url=payload.cover_image_url,
        status="approved" if bool(current_user.is_admin) else "pending",
        is_pinned=False,
        author_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return news_response(item)


@router.delete("/api/news/{news_id}")
@router.delete("/news/{news_id}")
def delete_news(
    news_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="News not found")
    if item.author_id != current_user.id and not bool(current_user.is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(item)
    db.commit()
    return {"status": "ok", "deleted": True}
