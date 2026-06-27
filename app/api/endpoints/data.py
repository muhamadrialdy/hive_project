import math
from typing import Optional

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.data_pipeline import (
    load_and_clean_data,
    get_daily_summary,
    DATA_PATH,
    has_data,
    save_uploaded_csv,
)
from app.services.cache import invalidate as cache_invalidate

router = APIRouter()


def _serialize(records: list[dict]) -> list[dict]:
    result = []
    for r in records:
        row = {}
        for k, v in r.items():
            if hasattr(v, "strftime"):
                row[k] = v.strftime("%Y-%m-%d")
            elif isinstance(v, float) and math.isnan(v):
                row[k] = None
            else:
                row[k] = v
        result.append(row)
    return result


class IngestRow(BaseModel):
    date: str
    is_promo_period: float = 0.0
    day_of_week: Optional[str] = None
    new_enterpriser_count: int = 0
    new_bee_count: int = 0
    transaction_volume_online: int = 0
    transaction_volume_offline: int = 0
    sales_ep_thousand_idr: float = 0.0
    top_product_id: Optional[str] = None


@router.get("/status")
def data_status():
    """Cheap probe — does any CSV exist? Used by the frontend to render an empty state."""
    return {"has_data": has_data()}


@router.get("/summary")
def summary():
    if not has_data():
        raise HTTPException(404, "No dataset yet. Upload one via /api/data/upload.")
    return get_daily_summary()


@router.get("/table")
def get_table(limit: int = 50, offset: int = 0):
    if not has_data():
        return {"total": 0, "offset": offset, "limit": limit, "records": []}
    df = load_and_clean_data()
    df = df.sort_values("date", ascending=False)
    total = len(df)
    page = df.iloc[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "records": _serialize(page.to_dict(orient="records"))}


@router.get("/recent")
def get_recent():
    if not has_data():
        return []
    df = load_and_clean_data()
    df = df.sort_values("date", ascending=False).head(10)
    return _serialize(df.to_dict(orient="records"))


@router.get("/chart")
def get_chart_data(days: int = 90):
    if not has_data():
        return {
            "dates": [], "new_enterpriser_count": [], "new_bee_count": [],
            "transaction_volume_online": [], "transaction_volume_offline": [],
            "sales_ep_thousand_idr": [], "is_promo_period": [],
        }
    df = load_and_clean_data()
    df = df.sort_values("date", ascending=True).tail(days)
    return {
        "dates": [d.strftime("%Y-%m-%d") for d in df["date"]],
        "new_enterpriser_count": df["new_enterpriser_count"].tolist(),
        "new_bee_count": df["new_bee_count"].tolist(),
        "transaction_volume_online": df["transaction_volume_online"].tolist(),
        "transaction_volume_offline": df["transaction_volume_offline"].tolist(),
        "sales_ep_thousand_idr": df["sales_ep_thousand_idr"].tolist(),
        "is_promo_period": df["is_promo_period"].tolist(),
    }


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """Save a CSV to notebooks/data/ — becomes the active dataset immediately."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    content = await file.read()
    try:
        info = save_uploaded_csv(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    cache_invalidate("stats:")
    cache_invalidate("forecast:")
    return info


@router.post("/ingest")
def ingest_data(row: IngestRow):
    if not has_data():
        raise HTTPException(400, "No dataset to append to. Upload a CSV first via /api/data/upload.")
    df = load_and_clean_data()
    day_of_week = row.day_of_week or pd.Timestamp(row.date).day_name()
    new_row = pd.DataFrame([{
        "date": row.date,
        "is_promo_period": row.is_promo_period,
        "day_of_week": day_of_week,
        "new_enterpriser_count": row.new_enterpriser_count,
        "new_bee_count": row.new_bee_count,
        "transaction_volume_online": row.transaction_volume_online,
        "transaction_volume_offline": row.transaction_volume_offline,
        "sales_ep_thousand_idr": row.sales_ep_thousand_idr,
        "top_product_id": row.top_product_id or "",
    }])
    updated = pd.concat([df, new_row], ignore_index=True)
    updated.to_csv(DATA_PATH, index=False)
    # Underlying CSV changed — drop cached summaries and forecasts.
    cache_invalidate("stats:")
    cache_invalidate("forecast:")
    return {"message": f"Row for {row.date} ingested successfully."}
