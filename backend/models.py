from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_order=True, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    bio = Column(Text, nullable=True)

class DictionaryWord(Base):
    __tablename__ = "dictionary_words"

    id = Column(Integer, primary_key=True, index=True)
    root_word = Column(String, index=True, nullable=False)  # Ortaq kök söz (Məs: Tengri / Yol)
    az_word = Column(String, nullable=False)                 # Azərbaycan
    tr_word = Column(String, nullable=False)                 # Türkiyə
    kk_word = Column(String, nullable=True)                  # Qazaxıstan
    uz_word = Column(String, nullable=True)                  # Özbəkistan
    description = Column(Text, nullable=True)               # Sözün etimoloji hekayəsi

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(String, nullable=False)        # Məs: "React, Python, Design"
    owner_id = Column(Integer, ForeignKey("users.id"))