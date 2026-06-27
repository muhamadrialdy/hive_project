import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db.session import Base, get_db
from app.models.db_models import Config

# Setup a test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    # Mock config for tests
    db.add(Config(key="GEMINI_API_KEY", value="TEST_KEY"))
    db.commit()
    db.close()

def test_create_session():
    response = client.post("/api/chat/sessions", json={"title": "Test Chat"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Chat"
    assert "id" in data

def test_list_sessions():
    client.post("/api/chat/sessions", json={"title": "Test Chat 1"})
    client.post("/api/chat/sessions", json={"title": "Test Chat 2"})
    
    response = client.get("/api/chat/sessions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] in ["Test Chat 1", "Test Chat 2"]

from unittest.mock import patch

@patch("app.api.endpoints.chat.ask_hive_agent")
def test_ask_question_in_session(mock_ask):
    mock_ask.return_value = "Mocked Response"
    # 1. Create a session
    sess_res = client.post("/api/chat/sessions", json={"title": "Plot Test"})
    session_id = sess_res.json()["id"]
    
    # 2. Ask a generic question
    response = client.post(f"/api/chat/sessions/{session_id}/ask", json={"question": "hello"})
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert data["response"] == "Mocked Response"

@patch("app.api.endpoints.chat.ask_hive_agent")
def test_get_session_history(mock_ask):
    mock_ask.return_value = "A1"
    sess_res = client.post("/api/chat/sessions", json={"title": "History Test"})
    session_id = sess_res.json()["id"]
    
    client.post(f"/api/chat/sessions/{session_id}/ask", json={"question": "Q1"})
    
    response = client.get(f"/api/chat/sessions/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert "messages" in data
    assert len(data["messages"]) >= 2 # User Q1 + Agent A1
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][0]["content"] == "Q1"
