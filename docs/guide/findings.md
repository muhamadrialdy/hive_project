# Business findings

Detailed analysis lives in [notebooks/exploration.ipynb](https://github.com/muhamadrialdy/hive_project/blob/main/notebooks/exploration.ipynb). The notebook walks through ingestion, exploratory analysis, feature engineering, two model attempts, and a 7-day forward forecast.

## Headline takeaways

### 1. Promo periods are the dominant driver

The `is_promo_period` flag carries the strongest signal in the dataset, with a Pearson correlation of approximately **0.78** against `new_enterpriser_count`. Promo days roughly double the organic baseline.

This is the single most actionable lever for HDI leaders — promo timing directly controls registration volume.

### 2. Day-of-week seasonality is structural

The day-of-week effect is consistent across 4.5 years of data. Saturday and Sunday carry disproportionate registration volume; weekday registrations cluster around the weekly mean.

Onboarding capacity and customer-support SLAs should be resourced accordingly.

### 3. Short-term momentum is the top model feature

In the 10-feature Random Forest, `rolling_mean_7` (the trailing 7-day mean of registrations) is the single highest-importance feature — higher than the raw weekly lags (`lag_7`, `lag_14`).

In plain terms: a strong recent week is a stronger predictor of a strong next day than knowing what happened exactly one or two weeks ago.

### 4. Channel mix is trending toward online

The online transaction share has a clear upward trend over the dataset window. A continued rise indicates successful digital adoption and lower offline operational cost; a plateau signals a ceiling that requires targeted intervention.

## Recommendation to a Key Leader

> Focus promotional capital on **mid-week deployments (Tuesday / Wednesday)** to lift the weekly baseline, rather than stacking promos on weekends where organic demand already peaks. Reserve weekend capacity for **onboarding throughput** rather than acquisition spend.

## Model performance

The 10-feature Random Forest beats both the naive `lag_7` baseline and a smaller 4-feature attempt on a 30-day holdout. Headline metric:

- **MAE** typically lands in the high teens to low twenties for daily new-Enterpriser count
- **MAPE** typically lands in the 10–15% range

Live numbers are available via [`GET /api/ml/metrics`](/api#get-mlmetrics).

## Known model caveats

- **Cannot extrapolate beyond training maxima.** Random Forest predictions are bounded by the historical range. If the 30-day rolling mean shifts more than ~15% above the training peak, retrain.
- **Compounding error in iterative forecast.** Day N+1's prediction uses day N's prediction as `lag_1`. Errors compound — single-step MAE is the honest metric; multi-step forecasts widen.
- **No exogenous future signal beyond calendar features.** The model assumes `is_promo_period=0` for the next 7 days (no upcoming promos). When you know a promo is scheduled, set the feature manually before forecasting.
