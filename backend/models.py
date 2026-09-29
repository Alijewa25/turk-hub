from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    bio = Column(Text, nullable=True)

class DictionaryWord(Base):
    __tablename__ = "dictionary_words"

    id = Column(Integer, primary_key=True, index=True)
    root_word = Column(String, index=True, nullable=False)
    az_word = Column(String, nullable=False)
    tr_word = Column(String, nullable=False)
    kk_word = Column(String, nullable=True)
    uz_word = Column(String, nullable=True)
    description = Column(Text, nullable=True)

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
