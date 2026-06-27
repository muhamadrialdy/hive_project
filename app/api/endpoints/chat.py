from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from app.db.session import get_db
from app.models.db_models import Config, ChatSession, ChatMessage
from app.models.schemas import ChatSessionCreate, ChatSessionModel, ChatMessageModel, ChatRequest
from app.services.llm_agent import ask_hive_agent

router = APIRouter()

@router.post("/sessions", response_model=ChatSessionModel)
def create_session(session: ChatSessionCreate, db: Session = Depends(get_db)):
    db_session = ChatSession(title=session.title, created_at=datetime.utcnow().isoformat())
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

@router.get("/sessions", response_model=List[ChatSessionModel])
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).order_by(ChatSession.id.desc()).all()
    # To satisfy the simple schema, we can return empty messages for the list
    result = []
    for s in sessions:
        result.append(ChatSessionModel(id=s.id, title=s.title, messages=[]))
    return result

@router.get("/sessions/{session_id}", response_model=ChatSessionModel)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.id).all()
    return ChatSessionModel(id=session.id, title=session.title, messages=messages)

@router.post("/sessions/{session_id}/ask")
def ask_question_in_session(session_id: int, request: ChatRequest, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    api_key_record = db.query(Config).filter(Config.key == "GEMINI_API_KEY").first()
    model_record = db.query(Config).filter(Config.key == "GEMINI_MODEL").first()
    api_key = api_key_record.value if api_key_record else None
    model_name = model_record.value if model_record else "gemini-3.0-flash"
    
    if not api_key:
        return {"response": "Please configure your Gemini API Key in the Admin Widget first."}
        
    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=request.question, created_at=datetime.utcnow().isoformat())
    db.add(user_msg)
    db.commit()

    # Get history to pass to agent
    history = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    # Exclude the just-added user message from history passed as context (we pass it as current question)
    history = history[:-1]

    try:
        answer = ask_hive_agent(request.question, api_key=api_key, model_name=model_name, history=history)
    except Exception as e:
        answer = f"Gemini API Error: Terjadi kesalahan saat menghubungi layanan AI. {str(e)}"
    
    # Save agent message
    agent_msg = ChatMessage(session_id=session_id, role="agent", content=answer, created_at=datetime.utcnow().isoformat())
    db.add(agent_msg)
    db.commit()
    
    return {"response": answer}

@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Delete associated messages first
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    
    # Delete session
    db.delete(session)
    db.commit()
    return {"message": "Session deleted successfully"}
