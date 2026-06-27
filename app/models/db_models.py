from sqlalchemy import Column, Integer, String, Text
from app.db.session import Base

# Role values
ROLE_SUPER_ADMIN = "super_admin"
ROLE_USER = "user"

# Status values
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"

# Whitelist that auto-elevates to super admin on first login / registration.
SUPER_ADMIN_EMAILS = {"admin.hive@gmail.com"}


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)  # Nullable for first-time login
    role = Column(String, nullable=False, default=ROLE_USER)
    status = Column(String, nullable=False, default=STATUS_PENDING)


class Config(Base):
    __tablename__ = "config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    created_at = Column(String)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, index=True)
    role = Column(String)
    content = Column(Text)
    created_at = Column(String)
