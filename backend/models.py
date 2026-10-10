from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    country = Column(String, nullable=True)          # Azerbaijan, Türkiye, Kazakhstan, etc.
    university = Column(String, nullable=True)       # Baku Engineering University, etc.
    bio = Column(Text, nullable=True)
    profile_picture = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    skills = relationship("UserSkill", back_populates="user", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="creator")
    following = relationship(
        "Follow",
        foreign_keys="Follow.follower_id",
        back_populates="follower",
        cascade="all, delete-orphan",
    )
    followers = relationship(
        "Follow",
        foreign_keys="Follow.followed_id",
        back_populates="followed",
        cascade="all, delete-orphan",
    )
    stories = relationship("Story", back_populates="author", cascade="all, delete-orphan")


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "followed_id", name="uq_follow_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    followed_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    follower = relationship("User", foreign_keys=[follower_id], back_populates="following")
    followed = relationship("User", foreign_keys=[followed_id], back_populates="followers")


class Story(Base):
    __tablename__ = "stories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    country = Column(String, nullable=True)
    text = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    author = relationship("User", back_populates="stories")


class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    skill_name = Column(String, nullable=False)     # e.g., "Python", "React", "Finance"

    # Relationship
    user = relationship("User", back_populates="skills")


class Dictionary(Base):
    __tablename__ = "dictionary"

    id = Column(Integer, primary_key=True, index=True)
    root_concept = Column(String, index=True, nullable=False)  # e.g., "Birlik / Bir"
    az_val = Column(String, nullable=True)  # Azerbaijani
    tr_val = Column(String, nullable=True)  # Turkish
    kk_val = Column(String, nullable=True)  # Kazakh
    uz_val = Column(String, nullable=True)  # Uzbek
    ky_val = Column(String, nullable=True)  # Kyrgyz
    tm_val = Column(String, nullable=True)  # Turkmen
    etymology_note = Column(Text, nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    creator = relationship("User", back_populates="projects")
    # keep compatibility name if accessed differently? but keep as is; also set backref via creator