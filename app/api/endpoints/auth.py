from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.db_models import (
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    STATUS_APPROVED,
    STATUS_PENDING,
    SUPER_ADMIN_EMAILS,
    User,
)

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class MeResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form_data.username
    user = db.query(User).filter(User.email == email).first()
    is_super = email in SUPER_ADMIN_EMAILS

    if not user:
        if is_super:
            # First-time super admin login: create + set password + auto-approve
            user = User(
                email=email,
                hashed_password=get_password_hash(form_data.password),
                role=ROLE_SUPER_ADMIN,
                status=STATUS_APPROVED,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(status_code=400, detail="Invalid credentials")
    else:
        # Safety net: super-admin email always coerces to super_admin + approved
        if is_super and (user.role != ROLE_SUPER_ADMIN or user.status != STATUS_APPROVED):
            user.role = ROLE_SUPER_ADMIN
            user.status = STATUS_APPROVED
            db.commit()

        if not user.hashed_password:
            # User row exists but no password set yet (e.g. registered + approved
            # but never logged in) — treat this login as setting the password.
            user.hashed_password = get_password_hash(form_data.password)
            db.commit()
        elif not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect username or password")

        if user.status != STATUS_APPROVED:
            raise HTTPException(
                status_code=403,
                detail=f"Account is {user.status}. Wait for a super admin to approve.",
            )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "role": user.role, "status": user.status},
    }


@router.post("/register", response_model=MeResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    # Whitelisted super-admin email registers as approved super_admin immediately.
    is_super = email in SUPER_ADMIN_EMAILS
    user = User(
        email=email,
        hashed_password=get_password_hash(req.password),
        role=ROLE_SUPER_ADMIN if is_super else ROLE_USER,
        status=STATUS_APPROVED if is_super else STATUS_PENDING,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return MeResponse(id=user.id, email=user.email, role=user.role, status=user.status)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        status=current_user.status,
    )
