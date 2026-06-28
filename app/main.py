from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.core.config import settings
from app.api.api_router import api_router
from app.db.session import engine, Base
from app.models import db_models

Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    columns = [c["name"] for c in inspect(engine).get_columns("chat_sessions")]
    if "user_id" not in columns:
        conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0"))
        conn.commit()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend for HDI Intelligence & Value Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME}"}
