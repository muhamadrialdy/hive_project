import json
import datetime
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib

from app.services.data_pipeline import load_and_clean_data, has_data
from app.services.cache import invalidate as cache_invalidate

log = logging.getLogger(__name__)
router = APIRouter()

MODELS_STORE = Path(__file__).parent.parent.parent.parent / "notebooks" / "models_store"
MODELS_STORE.mkdir(exist_ok=True)
METADATA_FILE = MODELS_STORE / "metadata.json"

FEATURES = [
    "is_promo_period", "dow", "is_weekend", "month",
    "lag_1", "lag_3", "lag_7", "lag_14",
    "rolling_mean_7", "rolling_std_7",
]
TARGET = "new_enterpriser_count"

# MAE above this on the 30-day holdout flags a model as Drifting.
DRIFT_MAE_THRESHOLD = 50.0


# ─── metadata helpers ────────────────────────────────────────────────────────

def _load_metadata() -> dict:
    if METADATA_FILE.exists():
        try:
            data = json.loads(METADATA_FILE.read_text())
        except json.JSONDecodeError:
            data = {}
    else:
        data = {}
    data.setdefault("artifacts", [])
    data.setdefault("active_version", None)
    data.setdefault("backup_version", None)
    return data


def _save_metadata(meta: dict) -> None:
    METADATA_FILE.write_text(json.dumps(meta, indent=2))


def _artifact(meta: dict, version: int) -> Optional[dict]:
    for a in meta["artifacts"]:
        if a["version"] == version:
            return a
    return None


# ─── training ────────────────────────────────────────────────────────────────

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


def _train_new_model() -> tuple[RandomForestRegressor, dict, dict[str, float]]:
    """Train + evaluate on 30-day holdout. Returns (model, metrics, importances)."""
    df = load_and_clean_data().set_index("date").resample("D").ffill()
    df = _build_features(df)

    HOLDOUT = 30
    train, test = df.iloc[:-HOLDOUT], df.iloc[-HOLDOUT:]

    model = RandomForestRegressor(n_estimators=200, random_state=42)
    model.fit(train[FEATURES], train[TARGET])
    pred = model.predict(test[FEATURES])

    metrics = _compute_metrics(test[TARGET], pred)
    importances = {feat: round(float(imp), 4) for feat, imp in zip(FEATURES, model.feature_importances_)}
    return model, metrics, importances


# ─── active-model loader (with backup fallback) ──────────────────────────────

_MODEL_CACHE: dict[int, RandomForestRegressor] = {}


def _load_artifact(version: int) -> RandomForestRegressor:
    if version in _MODEL_CACHE:
        return _MODEL_CACHE[version]
    meta = _load_metadata()
    entry = _artifact(meta, version)
    if entry is None:
        raise FileNotFoundError(f"Artifact v{version} not in metadata")
    path = MODELS_STORE / entry["file"]
    model = joblib.load(path)
    _MODEL_CACHE[version] = model
    return model


def load_serving_model() -> tuple[RandomForestRegressor, int, Optional[str]]:
    """Return (model, version_used, warning).

    Tries active → backup → raises. Caches loaded models per-process.
    """
    meta = _load_metadata()
    active = meta.get("active_version")
    backup = meta.get("backup_version")

    if active is not None:
        try:
            return _load_artifact(active), active, None
        except Exception as e:
            log.warning("Active model v%s unavailable (%s); trying backup", active, e)
            if backup is not None and backup != active:
                try:
                    return _load_artifact(backup), backup, f"Active v{active} failed; serving backup v{backup}"
                except Exception as e2:
                    log.warning("Backup model v%s unavailable too (%s)", backup, e2)

    raise FileNotFoundError("No usable model artifact. POST /api/ml/train first.")


# ─── endpoints ───────────────────────────────────────────────────────────────

@router.get("/metrics")
def get_metrics():
    """Live MAE/RMSE/MAPE for the *active* model evaluated on the 30-day holdout.
    Falls back to training a fresh model if none is stored yet."""
    meta = _load_metadata()
    active = meta.get("active_version")

    if active is None or _artifact(meta, active) is None:
        if not has_data():
            raise HTTPException(404, "No dataset. Upload a CSV via /api/data/upload first.")
        _, metrics, importances = _train_new_model()
        return {
            **metrics,
            "status": "Healthy" if metrics["mae"] < DRIFT_MAE_THRESHOLD else "Drifting",
            "artifact_count": len(meta["artifacts"]),
            "active_version": None,
            "backup_version": meta.get("backup_version"),
            "latest_version": meta["artifacts"][-1]["version"] if meta["artifacts"] else None,
            "feature_importances": importances,
            "note": "No active model; metrics computed from a fresh train.",
        }

    entry = _artifact(meta, active)
    metrics = entry.get("metrics", {})
    status = "Healthy" if metrics.get("mae", 0) < DRIFT_MAE_THRESHOLD else "Drifting"
    return {
        **metrics,
        "status": status,
        "artifact_count": len(meta["artifacts"]),
        "active_version": active,
        "backup_version": meta.get("backup_version"),
        "latest_version": meta["artifacts"][-1]["version"] if meta["artifacts"] else None,
        "feature_importances": entry.get("feature_importances", {}),
    }


@router.post("/train")
def trigger_train():
    if not has_data():
        raise HTTPException(404, "No dataset. Upload a CSV via /api/data/upload first.")

    model, metrics, importances = _train_new_model()
    status = "Healthy" if metrics["mae"] < DRIFT_MAE_THRESHOLD else "Drifting"

    meta = _load_metadata()
    version = max((a["version"] for a in meta["artifacts"]), default=0) + 1
    filename = f"model_v{version}.joblib"
    joblib.dump(model, MODELS_STORE / filename)

    entry = {
        "version": version,
        "trained_at": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "features": FEATURES,
        "feature_importances": importances,
        "training_rows": int(len(load_and_clean_data())) - 30,
        "metrics": metrics,
        "status": status,
        "file": filename,
    }
    meta["artifacts"].append(entry)

    # Auto-promote: first ever model becomes active; subsequent train sets the
    # previous active as backup and promotes the new one.
    prev_active = meta.get("active_version")
    if prev_active is None:
        meta["active_version"] = version
    elif status == "Healthy":
        meta["backup_version"] = prev_active
        meta["active_version"] = version

    _save_metadata(meta)
    cache_invalidate("forecast:")  # forecasts may use the new model
    return {
        "message": f"Model v{version} trained and saved as {filename}.",
        "artifact": entry,
        "active_version": meta["active_version"],
        "backup_version": meta["backup_version"],
    }


@router.get("/artifacts")
def list_artifacts():
    meta = _load_metadata()
    return {
        "active_version": meta.get("active_version"),
        "backup_version": meta.get("backup_version"),
        "artifacts": list(reversed(meta["artifacts"])),
    }


@router.post("/artifacts/{version}/activate")
def activate_artifact(version: int):
    meta = _load_metadata()
    if _artifact(meta, version) is None:
        raise HTTPException(404, f"Artifact v{version} not found")
    # If the new active was previously the backup, clear backup to avoid pointing both to the same.
    if meta.get("backup_version") == version:
        meta["backup_version"] = meta.get("active_version")
    meta["active_version"] = version
    _save_metadata(meta)
    _MODEL_CACHE.pop(version, None)  # ensure we reload from disk next call
    cache_invalidate("forecast:")
    return {"active_version": version, "backup_version": meta["backup_version"]}


@router.post("/artifacts/{version}/backup")
def set_backup_artifact(version: int):
    meta = _load_metadata()
    if _artifact(meta, version) is None:
        raise HTTPException(404, f"Artifact v{version} not found")
    if meta.get("active_version") == version:
        raise HTTPException(400, "Backup must differ from active")
    meta["backup_version"] = version
    _save_metadata(meta)
    return {"active_version": meta["active_version"], "backup_version": version}


@router.delete("/artifacts/{version}")
def delete_artifact(version: int):
    meta = _load_metadata()
    entry = _artifact(meta, version)
    if entry is None:
        raise HTTPException(404, f"Artifact v{version} not found")
    if meta.get("active_version") == version:
        raise HTTPException(400, "Cannot delete the active model — activate another first.")
    if meta.get("backup_version") == version:
        meta["backup_version"] = None

    # Remove file + entry
    file_path = MODELS_STORE / entry["file"]
    file_path.unlink(missing_ok=True)
    meta["artifacts"] = [a for a in meta["artifacts"] if a["version"] != version]
    _save_metadata(meta)
    _MODEL_CACHE.pop(version, None)
    return {"deleted_version": version, "remaining": len(meta["artifacts"])}
