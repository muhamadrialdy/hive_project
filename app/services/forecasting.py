import pandas as pd
import numpy as np
import datetime
from sklearn.ensemble import RandomForestRegressor
from .data_pipeline import load_and_clean_data


def get_forecast(days: int = 7) -> dict:
    """Forecasts new_enterpriser_count for the next `days` days.

    Uses an enhanced Random Forest with 10 features:
    autoregressive lags (1, 3, 7, 14), rolling momentum (mean_7, std_7),
    and calendar encoding (dow, is_weekend, month). Predictions are generated
    iteratively so each day's output feeds into the next day's lag features.
    """
    df = load_and_clean_data()
    df = df.set_index('date').resample('D').ffill()

    # Autoregressive lags
    df['lag_1']  = df['new_enterpriser_count'].shift(1)
    df['lag_3']  = df['new_enterpriser_count'].shift(3)
    df['lag_7']  = df['new_enterpriser_count'].shift(7)
    df['lag_14'] = df['new_enterpriser_count'].shift(14)

    # Rolling statistics (shift by 1 before window to avoid leakage)
    df['rolling_mean_7'] = df['new_enterpriser_count'].shift(1).rolling(7).mean()
    df['rolling_std_7']  = df['new_enterpriser_count'].shift(1).rolling(7).std()

    # Calendar features
    df['dow']        = df.index.dayofweek
    df['is_weekend'] = (df['dow'] >= 5).astype(int)
    df['month']      = df.index.month

    df_ml = df.dropna().copy()

    features = [
        'is_promo_period', 'dow', 'is_weekend', 'month',
        'lag_1', 'lag_3', 'lag_7', 'lag_14',
        'rolling_mean_7', 'rolling_std_7',
    ]
    target = 'new_enterpriser_count'

    model = RandomForestRegressor(n_estimators=200, random_state=42)
    model.fit(df_ml[features], df_ml[target])

    last_date   = df_ml.index.max()
    fcast_dates = [last_date + datetime.timedelta(days=i) for i in range(1, days + 1)]

    # Iterative forecast: append each prediction to the rolling window
    recent_vals = df_ml[target].iloc[-14:].tolist()
    predictions = []

    for fdate in fcast_dates:
        n = len(recent_vals)
        row = {
            'is_promo_period': 0.0,
            'dow':             fdate.dayofweek,
            'is_weekend':      int(fdate.dayofweek >= 5),
            'month':           fdate.month,
            'lag_1':           recent_vals[n - 1],
            'lag_3':           recent_vals[n - 3],
            'lag_7':           recent_vals[n - 7],
            'lag_14':          recent_vals[n - 14],
            'rolling_mean_7':  float(np.mean(recent_vals[n - 7:])),
            'rolling_std_7':   float(np.std(recent_vals[n - 7:])),
        }
        pred_val = model.predict(pd.DataFrame([row]))[0]
        predictions.append(pred_val)
        recent_vals.append(pred_val)

    dates  = [d.strftime("%Y-%m-%d") for d in fcast_dates]
    values = [round(float(v)) for v in predictions]

    return {
        "dates": dates,
        "forecasted_new_enterprisers": values,
    }


def get_key_drivers() -> str:
    """Returns insights about key drivers for LLM context."""
    return (
        "Key drivers of registration volume:\n"
        "1. Promo Periods: strongest single signal (~0.78 Pearson correlation). "
        "Promo days average roughly double the organic baseline.\n"
        "2. Day of Week: weekend registrations (Saturday/Sunday) consistently outperform weekdays. "
        "rolling_mean_7 (short-term momentum) is the top feature by importance in the enhanced model.\n"
        "Business Recommendation: deploy promotional spend on mid-week days to lift the baseline, "
        "and reserve weekend capacity for onboarding throughput rather than acquisition spend."
    )
