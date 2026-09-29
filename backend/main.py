from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

import models
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
    query = db.query(models.DictionaryWord)
    if q:
        # Kök sözdə və ya Azərbaycan/Türkiyə qarşılığında axtarış
        search_pattern = f"%{q}%"
        query = query.filter(
            (models.DictionaryWord.root_word.ilike(search_pattern)) |
            (models.DictionaryWord.az_word.ilike(search_pattern)) |
            (models.DictionaryWord.tr_word.ilike(search_pattern))
        )
    return query.all()