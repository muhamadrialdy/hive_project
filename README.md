# HIVE — HDI Intelligence & Value Engine

HIVE is a natural-language analytics platform for HDI business leaders. It ingests daily operational data, surfaces it through a dashboard, forecasts new Enterpriser registrations seven days ahead, and exposes a Gemini-powered chat agent that answers business questions in Bahasa Indonesia.

The repository contains a FastAPI backend, a React + Vite frontend, and an in-browser Jupyter-style notebook for ad-hoc analysis against the same dataset.

---

## Capabilities

- **Data ingestion & EDA** — load, clean, and explore `hdi_daily_ops.csv` (1,631+ daily records).
- **7-day forecast** — Random Forest with 10 features (autoregressive lags, rolling momentum, calendar encoding) generated iteratively.
- **MLOps surface** — train new model versions, list artifacts, monitor MAE / RMSE / MAPE drift on a 30-day holdout.
- **Conversational agent** — Gemini-backed chat that produces summaries plus inline Plotly charts for trend and forecast questions.
- **Notebook workspace** — in-app .ipynb editor with auto-save, execution counts, and round-trip back to nbformat JSON.

---

## Repository layout

```
hive_project/
├── app/                          FastAPI backend
│   ├── main.py                   App entrypoint (CORS, routers, DB init)
│   ├── api/
│   │   ├── api_router.py         Mounts /auth, /admin, /data, /ml, /forecast, /chat, /notebook
│   │   └── endpoints/            One module per router
│   ├── services/
│   │   ├── data_pipeline.py      CSV load, clean, summary stats
│   │   ├── forecasting.py        Random Forest 7-day forecast
│   │   ├── cache.py              Redis TTL cache with graceful no-Redis fallback
│   │   └── llm_agent.py          Gemini chat with chart attachments
│   ├── models/
│   │   ├── db_models.py          User, Config, ChatSession, ChatMessage
│   │   └── schemas.py            Pydantic request/response models
│   ├── core/                     Settings + password hashing / JWT
│   ├── db/session.py             SQLite engine (hive.db)
│   ├── models_store/             Trained model .joblib artifacts + metadata.json
│   └── tests/                    Pytest suite
├── hive_frontend/                React + Vite + TypeScript
│   ├── src/components/widgets/   DataWidget, MLWidget, ChatWidget, NotebookWidget, AdminWidget
│   └── vite.config.ts
├── notebooks/                    User notebooks (exploration.ipynb auto-opens in the app)
├── data/hdi_daily_ops.csv        Legacy dataset (fallback if notebooks/data/ is empty)
├── docs/                         VitePress documentation site
├── scripts/                      Dev hooks (post-edit test runner)
└── pyproject.toml                uv-managed Python dependencies
```

Architecture diagrams and component-level detail live in [ARCHITECTURE.md](ARCHITECTURE.md). The full endpoint reference is in [API.md](API.md). A full version history is in [CHANGELOG.md](CHANGELOG.md).

---

## Getting started

### Option A — Docker (recommended)

Everything runs in containers, no local Python/Node required:

```bash
git clone git@github.com:muhamadrialdy/hive_project.git
cd hive_project
cp .env.example .env

# Generate a strong SECRET_KEY and paste into .env
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'

docker compose up -d --build
```

- Frontend: http://localhost
- Backend (proxied via nginx): http://localhost/api/
- Redis: internal, no host port exposed

Tail logs with `docker compose logs -f backend` (or `frontend`, `redis`). Stop with `docker compose down` (`-v` also wipes volumes).

The Gemini API key is set in-app via **Settings & API** — no need to put it in `.env` unless you want a bootstrap default.

### Option B — Local dev (no Docker)

Useful for fast iteration with hot reload.

#### Prerequisites

- Python 3.12+ with [`uv`](https://github.com/astral-sh/uv) installed
- Node.js 20+
- Optional: a Gemini API key for the chat agent

#### Backend

```bash
cd hive_project
uv sync
cp .env.example .env       # then edit if you want to change HOST/PORT/CORS
uv run python main.py      # reads HOST/PORT from .env and launches uvicorn with reload
```

Defaults to `http://127.0.0.1:8088`. FastAPI's auto-generated OpenAPI explorer is at `/docs`.

If you'd rather run uvicorn directly, that still works — just pass the host/port explicitly:

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

#### Frontend

In a second terminal:

```bash
cd hive_project/hive_frontend
npm install
cp .env.example .env       # only if you changed the backend URL/port
npm run dev
```

The dev server runs on `http://localhost:VITE_PORT` (default `5173`) and calls the backend at `VITE_API_URL` (default `http://127.0.0.1:8088/api`). Both are configurable via [hive_frontend/.env](hive_frontend/.env.example). If you change `VITE_PORT`, remember to add the new origin to `CORS_ORIGINS` in the backend `.env`.

Open the dashboard and log in with `admin.hive@gmail.com` — the password you submit on the first attempt becomes permanent.

#### Gemini API key

The chat agent stays disabled until a key is configured. Two options:

1. **In-app:** Settings → API tab, paste the key and a model name (e.g. `gemini-2.5-flash`). Persisted to the `config` table.
2. **Environment:** export `GEMINI_API_KEY=…` before starting the backend; the value is loaded by [app/core/config.py](app/core/config.py).

---

## Documentation site

A VitePress site lives in [docs/](docs/) and serves the same content as `README.md`, `ARCHITECTURE.md`, and `API.md`. It is **embedded inside the React dashboard** — open the **Documentation** tab from the sidebar.

The site is built into `hive_frontend/public/docs/` (gitignored) and served by Vite at `/docs/`. The frontend's `npm run dev` and `npm run build` automatically rebuild docs first via `predev` / `prebuild` scripts; after editing markdown in `docs/`, trigger a manual rebuild with:

```bash
cd hive_project/hive_frontend
npm run docs:rebuild
```

If you prefer a standalone docs dev server (with HMR while editing markdown), run the original flow:

```bash
cd hive_project/docs
npm install
npm run docs:dev      # http://localhost:5174
```

---

## Tests

```bash
cd hive_project
uv run pytest app/tests/ -x -q
```

A pre-configured post-edit hook ([scripts/post_edit_test.sh](scripts/post_edit_test.sh)) runs backend pytest on `.py` edits and frontend `tsc --noEmit` on `.ts/.tsx` edits when invoked from a Claude Code session.

---

## Key business findings

Detailed analysis lives in [notebooks/exploration.ipynb](notebooks/exploration.ipynb). Headline takeaways:

- **Promotional periods** are the dominant driver of registration spikes (~0.78 Pearson correlation against `new_enterpriser_count`).
- **Day-of-week seasonality** is consistent across 4.5 years; Saturday and Sunday carry disproportionate volume.
- **Short-term momentum** (`rolling_mean_7`) is the top feature by importance in the 10-feature Random Forest — more predictive than raw weekly lags.
- **Recommendation:** allocate promotional spend to mid-week days to lift the weekly baseline; reserve weekend capacity for onboarding throughput rather than acquisition spend.

---

## Production considerations

- **Deployment:** containerize the FastAPI app and serve the Vite build behind a reverse proxy. SQLite is appropriate for single-instance demo; swap to Postgres for multi-instance.
- **Model monitoring:** the `/api/ml/metrics` endpoint reports MAE / RMSE / MAPE against a 30-day holdout each call. Wire this to a scheduled job and emit to Prometheus or MLflow.
- **Drift detection:** apply a Kolmogorov-Smirnov check on `new_enterpriser_count` and `sales_ep_thousand_idr` against the training distribution; trigger retraining when the test rejects.
- **LLM cost control:** cache `get_full_summary_stats()` and `get_forecast()` outputs since the underlying CSV changes daily at most. Rate-limit chat sessions per user.

---

## Author

**Muhamad Rialdy** — rialdi102@gmail.com
