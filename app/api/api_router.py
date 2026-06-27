from fastapi import APIRouter
from app.api.endpoints import data, forecast, chat, auth, admin, ml, notebook

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(data.router, prefix="/data", tags=["data"])
api_router.include_router(ml.router, prefix="/ml", tags=["ml"])
api_router.include_router(forecast.router, prefix="/forecast", tags=["forecast"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(notebook.router, prefix="/notebook", tags=["notebook"])
