import pandas as pd
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent  # hive_project/
_NOTEBOOKS_DATA = _ROOT / "notebooks" / "data"
_LEGACY_DATA    = _ROOT / "data" / "hdi_daily_ops.csv"


def _resolve_data_path() -> Path:
    """Return the most-recently-modified CSV in notebooks/data/, falling back to data/."""
    _NOTEBOOKS_DATA.mkdir(parents=True, exist_ok=True)
    csvs = sorted(_NOTEBOOKS_DATA.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    if csvs:
        return csvs[0]
    if _LEGACY_DATA.exists():
        return _LEGACY_DATA
    raise FileNotFoundError("No CSV data file found in notebooks/data/ or data/")


DATA_PATH = _resolve_data_path()

def load_and_clean_data() -> pd.DataFrame:
    """Loads and cleans the HDI daily ops data."""
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Data file not found at {DATA_PATH}")
    
    df = pd.read_csv(DATA_PATH)
    
    # Clean and validate
    # Ensure date is datetime
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    
    # Handle missing values by forward filling or filling with 0 (simplification)
    df = df.ffill().fillna(0)
    
    # Ensure numeric types
    numeric_cols = [
        'is_promo_period', 'new_enterpriser_count', 'new_bee_count',
        'transaction_volume_online', 'transaction_volume_offline',
        'sales_ep_thousand_idr'
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
    return df

def get_daily_summary() -> dict:
    """Computes daily operational summary."""
    df = load_and_clean_data()
    # Let's get the latest available date for summary
    latest_date = df['date'].max()
    latest_data = df[df['date'] == latest_date].iloc[0]
    
    return {
        "date": latest_date.strftime("%Y-%m-%d"),
        "new_enterpriser_count": int(latest_data['new_enterpriser_count']),
        "sales_ep_thousand_idr": float(latest_data['sales_ep_thousand_idr']),
        "online_transactions": int(latest_data['transaction_volume_online']),
        "offline_transactions": int(latest_data['transaction_volume_offline'])
    }

def get_full_summary_stats() -> dict:
    """Returns aggregated summary for LLM context."""
    df = load_and_clean_data()
    total_new_enterprisers = int(df['new_enterpriser_count'].sum())
    total_sales = float(df['sales_ep_thousand_idr'].sum())
    
    # Weekly registrations (Last 7 days of data)
    last_7_days = df.tail(7)
    start_week = last_7_days['date'].min().strftime("%Y-%m-%d")
    end_week = last_7_days['date'].max().strftime("%Y-%m-%d")
    total_week = int(last_7_days['new_enterpriser_count'].sum())
    
    # Busiest day
    busiest_day = df.groupby('day_of_week')['new_enterpriser_count'].mean().idxmax()
    
    return {
        "total_new_enterprisers_all_time": total_new_enterprisers,
        "total_sales_ep_thousand_idr_all_time": total_sales,
        "new_enterprisers_this_week": total_week,
        "week_start_date": start_week,
        "week_end_date": end_week,
        "busiest_day_of_week": busiest_day,
        "latest_data_date": df['date'].max().strftime("%Y-%m-%d")
    }
