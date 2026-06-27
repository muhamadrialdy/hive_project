import json
import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib

from app.services.data_pipeline import load_and_clean_data

router = APIRouter()

MODELS_STORE = Path(__file__).parent.parent.parent / "models_store"
MODELS_STORE.mkdir(exist_ok=True)
METADATA_FILE = MODELS_STORE / "metadata.json"

FEATURES = [
    "is_promo_period", "dow", "is_weekend", "month",
    "lag_1", "lag_3", "lag_7", "lag_14",
    "rolling_mean_7", "rolling_std_7",
]
TARGET = "new_enterpriser_count"


def _load_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE) as f:
            return json.load(f)
    return {"artifacts": []}


def _save_metadata(meta: dict) -> None:
    with open(METADATA_FILE, "w") as f:
        json.dump(meta, f, indent=2)


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["lag_1"]  = df[TARGET].shift(1)
    df["lag_3"]  = df[TARGET].shift(3)
    df["lag_7"]  = df[TARGET].shift(7)
    df["lag_14"] = df[TARGET].shift(14)
    df["rolling_mean_7"] = df[TARGET].shift(1).rolling(7).mean()
    df["rolling_std_7"]  = df[TARGET].shift(1).rolling(7).std()
    df["dow"]        = df.index.dayofweek
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["month"]      = df.index.month
    return df.dropna()


def _compute_metrics(actual: pd.Series, predicted) -> dict:
    mae  = float(mean_absolute_error(actual, predicted))
    rmse = float(np.sqrt(mean_squared_error(actual, predicted)))
    mape = float(np.mean(np.abs((actual - predicted) / actual.replace(0, np.nan))) * 100)
    return {"mae": round(mae, 2), "rmse": round(rmse, 2), "mape": round(mape, 2)}


@router.get("/metrics")
def get_metrics():
    df = load_and_clean_data()
    df = df.set_index("date").resample("D").ffill()
    df = _build_features(df)

    HOLDOUT = 30
    train, test = df.iloc[:-HOLDOUT], df.iloc[-HOLDOUT:]

    model = RandomForestRegressor(n_estimators=200, random_state=42)
    model.fit(train[FEATURES], train[TARGET])
    pred = model.predict(test[FEATURES])

    m = _compute_metrics(test[TARGET], pred)
    m["status"] = "Healthy" if m["mae"] < 50 else "Drifting"

    meta = _load_metadata()
    m["artifact_count"] = len(meta["artifacts"])
    m["latest_version"] = meta["artifacts"][-1]["version"] if meta["artifacts"] else None
    return m


@router.post("/train")
def trigger_train():
    df = load_and_clean_data()
    df = df.set_index("date").resample("D").ffill()
    df = _build_features(df)

    HOLDOUT = 30
    train, test = df.iloc[:-HOLDOUT], df.iloc[-HOLDOUT:]

    model = RandomForestRegressor(n_estimators=200, random_state=42)
    model.fit(train[FEATURES], train[TARGET])
    pred = model.predict(test[FEATURES])

    m = _compute_metrics(test[TARGET], pred)
    status = "Healthy" if m["mae"] < 50 else "Drifting"

    meta = _load_metadata()
    version = len(meta["artifacts"]) + 1
    filename = f"model_v{version}.joblib"
    joblib.dump(model, MODELS_STORE / filename)

    entry = {
        "version": version,
        "trained_at": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "features": FEATURES,
        "training_rows": int(len(train)),
        "metrics": m,
        "status": status,
        "file": filename,
    }
    meta["artifacts"].append(entry)
    _save_metadata(meta)

    return {
        "message": f"Model v{version} trained and saved as {filename}.",
        "artifact": entry,
        "metrics": {**m, "status": status},
    }


@router.get("/artifacts")
def list_artifacts():
    meta = _load_metadata()
    return {"artifacts": list(reversed(meta["artifacts"]))}
