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
    query = db.query(models.DictionaryWord)
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            (models.DictionaryWord.root_word.ilike(search_pattern)) |
            (models.DictionaryWord.az_word.ilike(search_pattern)) |
            (models.DictionaryWord.tr_word.ilike(search_pattern))
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