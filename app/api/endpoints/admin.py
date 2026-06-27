from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.db_models import Config

router = APIRouter()

class ConfigUpdate(BaseModel):
    api_key: str
    model: str # Only allowing free tier models: gemini-1.5-flash or gemini-2.5-flash

@router.post("/config")
def update_config(config: ConfigUpdate, db: Session = Depends(get_db)):
    # Validate model
    allowed_models = ["gemini-3.5-flash", "gemini-3.0-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
    if config.model not in allowed_models:
        config.model = "gemini-3.0-flash" # fallback to free tier
        
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
        "model": model.value if model else "gemini-3.0-flash"
    }
