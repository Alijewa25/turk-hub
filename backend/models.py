from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
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
    category = Column(String, nullable=False)      # Sustainability, Tech, Culture
    min_countries_required = Column(Integer, default=2)
    status = Column(String, default="Recruiting")  # Recruiting, Unlocked, Completed
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    creator = relationship("User", back_populates="projects")