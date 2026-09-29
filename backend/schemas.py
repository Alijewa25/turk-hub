from pydantic import BaseModel
from typing import Optional

class ProjectCreate(BaseModel):
    title: str
    description: str
    required_skills: str

class ProjectResponse(ProjectCreate):
    id: int
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True
