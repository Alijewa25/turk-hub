from pydantic import BaseModel, computed_field
from typing import Optional, Dict
from datetime import datetime


class ProjectCreate(BaseModel):
    title: str
    description: str
    required_skills: str
    target_countries: Optional[str] = None
    contact_info: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    title: str
    description: str
    required_skills: Optional[str] = None
    target_countries: Optional[str] = None
    contact_info: Optional[str] = None
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    username: Optional[str] = None
    country: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    username: Optional[str] = None
    country: Optional[str] = None
    university: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    country: Optional[str] = None
    university: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None
    skills: Optional[list] = None
    institution: Optional[str] = None
    metadata: Optional[dict] = None

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


class PostCreate(BaseModel):
    body: Optional[str] = ""
    image_url: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None


class PostResponse(BaseModel):
    id: int
    user_id: int
    body: Optional[str] = None
    image_url: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    likes_count: int = 0
    comments_count: int = 0
    created_at: Optional[datetime] = None
    author: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    receiver_id: int
    content: str


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: str
    read: int = 0
    created_at: Optional[datetime] = None
    sender: Optional[UserResponse] = None
    receiver: Optional[UserResponse] = None

    class Config:
        from_attributes = True
class DictionaryBase(BaseModel):
    root_concept: str
    az_val: Optional[str] = None
    tr_val: Optional[str] = None
    kk_val: Optional[str] = None
    uz_val: Optional[str] = None
    ky_val: Optional[str] = None
    tm_val: Optional[str] = None
    etymology_note: Optional[str] = None


class DictionaryCreate(BaseModel):
    root_concept: str
    az_val: Optional[str] = None
    tr_val: Optional[str] = None
    kk_val: Optional[str] = None
    uz_val: Optional[str] = None
    ky_val: Optional[str] = None
    tm_val: Optional[str] = None
    etymology_note: Optional[str] = None


class DictionaryResponse(DictionaryBase):
    id: int
    source: Optional[str] = None

    @computed_field
    @property
    def dialects(self) -> Dict[str, Optional[str]]:
        return {
            "aze": self.az_val,
            "tur": self.tr_val,
            "kaz": self.kk_val,
            "uzb": self.uz_val,
            "kyg": self.ky_val,
            "tkm": self.tm_val,
        }

    class Config:
        from_attributes = True