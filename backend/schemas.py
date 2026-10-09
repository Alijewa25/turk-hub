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

class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    country: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    country: Optional[str] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
