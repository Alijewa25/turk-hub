import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import models
import schemas
from auth_utils import get_current_user
from database import get_db
from db_utils import safe_list_query
from notification_service import create_notification
from translation_service import (
    SUPPORTED_TRANSLATION_LANGS,
    detect_translation_lang,
    external_translate,
    normalize_translation_lang,
)

logger = logging.getLogger("turk_hub")

router = APIRouter(tags=["hub"])

MAX_TRANSLATION_CACHE_SIZE = 1000
TRANSLATION_CACHE: dict = {}


# --- DICTIONARY (SÖZLÜK) ---

@router.get("/api/dictionary", response_model=List[schemas.DictionaryResponse])
@router.get("/api/dictionary/search", response_model=List[schemas.DictionaryResponse])
@router.get("/dictionary", response_model=List[schemas.DictionaryResponse])
@router.get("/dictionary/search", response_model=List[schemas.DictionaryResponse])
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
    results = safe_list_query(lambda: query.all(), db, "dictionary")
    return results


@router.get("/api/dictionary/compare")
def dictionary_compare(
    q: str = Query(...),
    db: Session = Depends(get_db)
):
    search_pattern = f"%{q}%"
    items = safe_list_query(
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


@router.post("/api/dictionary/submit", response_model=schemas.DictionaryResponse)
@router.post("/dictionary/submit", response_model=schemas.DictionaryResponse)
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


# --- PROJECT HUB ---

@router.get("/api/projects", response_model=List[schemas.ProjectResponse])
@router.get("/projects", response_model=List[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    projects = safe_list_query(
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


@router.post("/api/projects", response_model=schemas.ProjectResponse)
@router.post("/projects", response_model=schemas.ProjectResponse)
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


@router.post("/api/projects/{project_id}/join")
@router.post("/projects/{project_id}/join")
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


@router.post("/api/projects/{project_id}/accept/{applicant_id}")
@router.post("/projects/{project_id}/accept/{applicant_id}")
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


# --- AI TRANSLATION ---

@router.post("/api/translate", response_model=schemas.TranslationResponse)
@router.post("/translate", response_model=schemas.TranslationResponse)
async def translate_text(payload: schemas.TranslationRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tərcümə üçün mətn tələb olunur",
        )

    target_lang = normalize_translation_lang(payload.target_lang)
    if target_lang not in SUPPORTED_TRANSLATION_LANGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dəstəklənməyən hədəf dili",
        )

    source_lang = normalize_translation_lang(payload.source_lang)
    if source_lang not in SUPPORTED_TRANSLATION_LANGS:
        source_lang = detect_translation_lang(text)

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

    external = await external_translate(text, source_lang, target_lang)
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
        detail="Tərcümə xidmətindən nəticə alınmadı",
    )
