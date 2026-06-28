# Production considerations

HIVE is currently a local single-user demo. This page lists what to harden before any deployment.

## Hard blockers

### 1. CORS is wide open

`app/main.py` configures `allow_origins=["*"]`. Restrict to the production frontend origin before exposing the API publicly.

### 2. Notebook cell execution is unsandboxed

`/api/notebook/execute` runs arbitrary Python in the API process with full filesystem and network access. Lines starting with `!` are passed to `subprocess.run` with `shell=True`.

For a public deployment, either:

- **Disable the notebook router entirely** by removing it from `app/api/api_router.py`
- **Sandbox the kernel** behind a per-user container (Docker / gVisor / Firejail) and proxy execution requests

### 3. JWT partially enforced

Chat endpoints (`/api/chat/*`) require a valid Bearer token and scope sessions per user. Admin endpoints require super-admin role. However, other routes (`/api/data/*`, `/api/ml/*`, `/api/forecast/*`, `/api/notebook/*`) do not enforce authentication yet.

Add `Depends(get_current_user)` to every remaining router before deploying.

## Should-do

### Model serving

The forecast endpoint **retrains on every request** (~100ms on this dataset, but linear in dataset size). For production:

1. Save trained models via `POST /api/ml/train` to `models_store/`
2. Have `/api/forecast/enterprisers` load the latest artifact instead of re-fitting
3. Schedule retraining nightly via cron or a workflow runner

### Caching

The CSV is read on every `/api/data/*` and `/api/forecast/*` call. For modest scale:

- Cache `load_and_clean_data()` output keyed on the CSV's mtime
- Cache `get_full_summary_stats()` and `get_forecast()` for ~1 hour
- A 100-line in-process LRU is sufficient — no Redis required until you scale horizontally

### LLM cost control

The chat agent reads the full dataset, computes stats, and runs a 7-day forecast on **every** question. Per-question cost is dominated by:

- ~30 days of CSV rows sent in the system instruction
- ~7 floats from the forecast
- Gemini's response tokens

Mitigations:

- Cache the system-instruction-context block per session, refresh on a TTL
- Truncate the trend table to a fixed token budget
- Rate-limit chat messages per user per minute

### Drift detection

Live MAE is exposed at `/api/ml/metrics` but is not automated. Suggested:

- Schedule a daily KS-test on `new_enterpriser_count` and `sales_ep_thousand_idr` against the training distribution
- Emit MAE / MAPE to a metrics backend (Prometheus, MLflow, CloudWatch)
- Auto-trigger `/api/ml/train` when drift exceeds a threshold

### Database

SQLite is fine for single-instance demo. For any horizontal scaling:

- Swap `app/db/session.py` to a Postgres URL via env var
- Run Alembic migrations (currently none — `Base.metadata.create_all` is the schema source of truth)
- Move the `config` table values to a secret manager (Gemini key shouldn't live in DB plaintext)

### Frontend bundling

For production deployment, `docker compose up -d --build` builds the frontend with Vite and serves the static bundle via nginx with API proxying. For standalone hosting:

```bash
cd hive_frontend
VITE_API_URL=/api npm run build    # outputs dist/
```

Serve `dist/` from any static host (Cloudflare Pages, S3+CloudFront, nginx) with a reverse proxy for `/api` to the backend.

## Nice-to-have

- **Structured logging** — currently `print()` and stacktraces. Switch to `structlog` or `loguru` with JSON output.
- **Health probe** — `GET /api/health` for k8s readiness / Cloud Run health.
- **OpenTelemetry** — automatic instrumentation for FastAPI + SQLAlchemy is one-line.
- **Per-user notebook scoping** — currently all users share `notebooks/`. Namespace by user id.
