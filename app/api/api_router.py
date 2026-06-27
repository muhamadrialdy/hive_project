from fastapi import APIRouter, Depends

from app.api.endpoints import admin, auth, chat, data, forecast, ml, notebook
from app.core.security import get_current_user

api_router = APIRouter()

# /auth/login is public — needed to obtain a token in the first place.
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Everything below requires a valid Bearer JWT.
_protected = [Depends(get_current_user)]
api_router.include_router(admin.router,    prefix="/admin",    tags=["admin"],    dependencies=_protected)
api_router.include_router(data.router,     prefix="/data",     tags=["data"],     dependencies=_protected)
api_router.include_router(ml.router,       prefix="/ml",       tags=["ml"],       dependencies=_protected)
api_router.include_router(forecast.router, prefix="/forecast", tags=["forecast"], dependencies=_protected)
api_router.include_router(chat.router,     prefix="/chat",     tags=["chat"],     dependencies=_protected)
api_router.include_router(notebook.router, prefix="/notebook", tags=["notebook"], dependencies=_protected)
