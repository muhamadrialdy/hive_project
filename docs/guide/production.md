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

### 3. Single hard-coded user

`/api/auth/login` accepts only `admin.hive@gmail.com`. The first password submitted becomes permanent. There is no signup, password reset, or role separation.

For multi-user use, replace with a proper user table + admin-only user-creation endpoint.

### 4. JWT not enforced downstream

The login endpoint issues a JWT, but no downstream route depends on it. The frontend uses the token to gate UI access only — any API client can call `/api/notebook/execute`, `/api/admin/config`, `/api/data/ingest`, etc. unauthenticated.

Add `Depends(get_current_user)` to every router before deploying.

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

Currently served from Vite dev. For production:

```bash
cd hive_frontend
npm run build       # outputs dist/
```

Serve `dist/` from any static host (Cloudflare Pages, S3+CloudFront, nginx). Update the hardcoded `http://127.0.0.1:8088` references in the widgets to read from a build-time env var.

## Nice-to-have

- **Structured logging** — currently `print()` and stacktraces. Switch to `structlog` or `loguru` with JSON output.
- **Health probe** — `GET /api/health` for k8s readiness / Cloud Run health.
- **OpenTelemetry** — automatic instrumentation for FastAPI + SQLAlchemy is one-line.
- **Per-user notebook scoping** — currently all users share `notebooks/`. Namespace by user id.
