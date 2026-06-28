from pydantic import BaseModel
from typing import List, Optional

class DailySummary(BaseModel):
    date: str
    new_enterpriser_count: int
    sales_ep_thousand_idr: float
    online_transactions: int
    offline_transactions: int

class ForecastResult(BaseModel):
    dates: List[str]
    forecasted_new_enterprisers: List[float]
    model_source: Optional[str] = None
    model_version: Optional[int] = None
    warning: Optional[str] = None

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    response: str

class ChatSessionCreate(BaseModel):
    title: Optional[str] = ""

class ChatMessageModel(BaseModel):
    id: int
    role: str
    content: str
    
    class Config:
        from_attributes = True

class ChatSessionModel(BaseModel):
    id: int
    title: str
    messages: List[ChatMessageModel] = []
    
    class Config:
        from_attributes = True
