from pydantic import BaseModel
from typing import Optional
from datetime import datetime

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
    university: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    country: Optional[str] = None
    university: Optional[str] = None
    bio: Optional[str] = None

class UserFollowInfo(UserResponse):
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False

class FollowStatus(BaseModel):
    following: bool
    followers: int

class Token(BaseModel):
    access_token: str
    token_type: str

class StoryCreate(BaseModel):
    text: str = ""
    media_url: Optional[str] = None
    country: Optional[str] = None

class StoryResponse(BaseModel):
    id: int
    user: UserResponse
    country: Optional[str] = None
    text: Optional[str] = None
    media_url: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
