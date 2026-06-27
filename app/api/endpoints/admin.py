from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_super_admin
from app.db.session import get_db
from app.models.db_models import (
    Config,
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    User,
)

router = APIRouter()


# ── Gemini config ──────────────────────────────────────────────────────────

class ConfigUpdate(BaseModel):
    api_key: str
    model: str  # Only allowing free tier models: gemini-1.5-flash or gemini-2.5-flash


@router.post("/config")
def update_config(config: ConfigUpdate, db: Session = Depends(get_db)):
    allowed_models = ["gemini-3.5-flash", "gemini-3.0-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
    if config.model not in allowed_models:
        config.model = "gemini-3.0-flash"  # fallback to free tier

    for key, value in [("GEMINI_API_KEY", config.api_key), ("GEMINI_MODEL", config.model)]:
        db_config = db.query(Config).filter(Config.key == key).first()
        if db_config:
            db_config.value = value
        else:
            db_config = Config(key=key, value=value)
            db.add(db_config)
    db.commit()
    return {"message": "Configuration updated successfully"}


@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    api_key = db.query(Config).filter(Config.key == "GEMINI_API_KEY").first()
    model = db.query(Config).filter(Config.key == "GEMINI_MODEL").first()
    return {
        "api_key": api_key.value if api_key else "",
        "model": model.value if model else "gemini-3.0-flash",
    }


# ── User management (super-admin only) ─────────────────────────────────────

class UserOut(BaseModel):
    id: int
    email: str
    role: str
    status: str


def _serialize_user(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, role=u.role, status=u.status)


@router.get("/users", response_model=List[UserOut])
def list_users(
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.id.desc()).all()
    return [_serialize_user(u) for u in users]


def _get_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.post("/users/{user_id}/approve", response_model=UserOut)
def approve_user(
    user_id: int,
    actor: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    user = _get_or_404(db, user_id)
    user.status = STATUS_APPROVED
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/users/{user_id}/reject", response_model=UserOut)
def reject_user(
    user_id: int,
    actor: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    user = _get_or_404(db, user_id)
    if user.id == actor.id:
        raise HTTPException(400, "Cannot reject yourself")
    user.status = STATUS_REJECTED
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    actor: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    user = _get_or_404(db, user_id)
    if user.id == actor.id:
        raise HTTPException(400, "Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"deleted_id": user_id}


@router.get("/users/pending-count")
def pending_count(
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    """Lightweight probe for the sidebar badge."""
    n = db.query(User).filter(User.status == STATUS_PENDING).count()
    return {"pending": n}
