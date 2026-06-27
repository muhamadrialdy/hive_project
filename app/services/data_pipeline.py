import pandas as pd
from pathlib import Path
from typing import Optional

from app.services.cache import ttl_cache

_ROOT = Path(__file__).parent.parent.parent  # hive_project/
_NOTEBOOKS_DATA = _ROOT / "notebooks" / "data"
_LEGACY_DATA    = _ROOT / "data" / "hdi_daily_ops.csv"

EXPECTED_COLUMNS = {
    "date",
    "is_promo_period",
    "new_enterpriser_count",
    "new_bee_count",
    "transaction_volume_online",
    "transaction_volume_offline",
    "sales_ep_thousand_idr",
}


def _resolve_data_path() -> Optional[Path]:
    """Most-recently-modified CSV in notebooks/data/, falling back to data/."""
    _NOTEBOOKS_DATA.mkdir(parents=True, exist_ok=True)
    csvs = sorted(_NOTEBOOKS_DATA.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    if csvs:
        return csvs[0]
    if _LEGACY_DATA.exists():
        return _LEGACY_DATA
    return None


def get_data_path() -> Path:
    """Active dataset path. Raises if no CSV exists yet."""
    p = _resolve_data_path()
    if p is None:
        raise FileNotFoundError("No CSV data file found. Upload one via /api/data/upload.")
    return p


# Backwards compat — some modules import this name directly. It re-resolves on
# each attribute access via a tiny proxy so uploads take effect without restart.
class _DataPathProxy:
    def __fspath__(self) -> str:
        return str(get_data_path())
    def __str__(self) -> str:
        return str(get_data_path())
    @property
    def parent(self) -> Path:
        return get_data_path().parent
    def exists(self) -> bool:
        return _resolve_data_path() is not None


DATA_PATH = _DataPathProxy()


def has_data() -> bool:
    """True if any usable CSV exists. Cheap probe — doesn't read the file."""
    return _resolve_data_path() is not None


def load_and_clean_data() -> pd.DataFrame:
    """Loads and cleans the HDI daily ops data."""
    path = get_data_path()
    df = pd.read_csv(path)

    # Date column → datetime
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")

    # Forward-fill then zero-fill remaining
    df = df.ffill().fillna(0)

    numeric_cols = [
        "is_promo_period", "new_enterpriser_count", "new_bee_count",
        "transaction_volume_online", "transaction_volume_offline",
        "sales_ep_thousand_idr",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    return df


def get_daily_summary() -> dict:
    """Latest day's snapshot."""
    df = load_and_clean_data()
    latest_date = df["date"].max()
    latest_data = df[df["date"] == latest_date].iloc[0]
    return {
        "date": latest_date.strftime("%Y-%m-%d"),
        "new_enterpriser_count": int(latest_data["new_enterpriser_count"]),
        "sales_ep_thousand_idr": float(latest_data["sales_ep_thousand_idr"]),
        "online_transactions": int(latest_data["transaction_volume_online"]),
        "offline_transactions": int(latest_data["transaction_volume_offline"]),
    }


@ttl_cache(key_prefix="stats:full_summary", ttl_seconds=3600)
def get_full_summary_stats() -> dict:
    """Returns aggregated summary for LLM context. Cached 1h via Redis when available."""
    df = load_and_clean_data()
    total_new_enterprisers = int(df["new_enterpriser_count"].sum())
    total_sales = float(df["sales_ep_thousand_idr"].sum())

    last_7_days = df.tail(7)
    start_week = last_7_days["date"].min().strftime("%Y-%m-%d")
    end_week = last_7_days["date"].max().strftime("%Y-%m-%d")
    total_week = int(last_7_days["new_enterpriser_count"].sum())

    busiest_day = df.groupby("day_of_week")["new_enterpriser_count"].mean().idxmax()

    return {
        "total_new_enterprisers_all_time": total_new_enterprisers,
        "total_sales_ep_thousand_idr_all_time": total_sales,
        "new_enterprisers_this_week": total_week,
        "week_start_date": start_week,
        "week_end_date": end_week,
        "busiest_day_of_week": busiest_day,
        "latest_data_date": df["date"].max().strftime("%Y-%m-%d"),
    }


def save_uploaded_csv(content: bytes, original_filename: str) -> dict:
    """Save uploaded CSV to notebooks/data/. Validates columns. Returns info."""
    _NOTEBOOKS_DATA.mkdir(parents=True, exist_ok=True)

    # Strip path components from filename
    safe_name = Path(original_filename).name
    if not safe_name.lower().endswith(".csv"):
        safe_name = f"{safe_name}.csv"
    target = _NOTEBOOKS_DATA / safe_name

    target.write_bytes(content)

    try:
        df = pd.read_csv(target)
    except Exception as e:
        target.unlink(missing_ok=True)
        raise ValueError(f"Could not parse CSV: {e}")

    missing = EXPECTED_COLUMNS - set(df.columns)
    if missing:
        target.unlink(missing_ok=True)
        raise ValueError(f"CSV is missing required columns: {sorted(missing)}")

    return {
        "filename": safe_name,
        "path": str(target.relative_to(_ROOT)),
        "rows": int(len(df)),
        "columns": list(df.columns),
    }
