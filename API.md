# API Reference

All endpoints are mounted under `/api`. The backend runs on `http://127.0.0.1:8088` by default.

FastAPI auto-generates an OpenAPI explorer at `http://127.0.0.1:8088/docs` — this document is the curated companion describing each route's purpose, request shape, and a copy-paste example.

**Authentication:** the JWT issued by `/auth/login` is not currently enforced on downstream routes. The token is used by the frontend to gate UI access only. Tightening this is a known follow-up (see [ARCHITECTURE.md](ARCHITECTURE.md) → "Known limitations").

---

## `/api/auth`

### `POST /auth/login`

OAuth2-password-flow login. The first password submitted for `admin.hive@gmail.com` becomes the permanent password.

**Request (form-encoded):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | Must be `admin.hive@gmail.com` |
| `password` | string | yes | Set permanently on first login |

**Response 200:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs…",
  "token_type": "bearer"
}
```

**Response 400:** `{"detail": "Incorrect username or password"}`

**Example:**

```bash
curl -X POST http://127.0.0.1:8088/api/auth/login \
  -d "username=admin.hive@gmail.com&password=hunter2" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

---

## `/api/admin`

### `GET /admin/config`

Read the persisted Gemini API key and model name. Returns empty strings if never set.

**Response 200:**

```json
{ "api_key": "AIza…", "model": "gemini-2.5-flash" }
```

### `POST /admin/config`

Upsert the Gemini configuration. The model name is restricted to a known list; unknown names fall back to `gemini-3.0-flash`.

**Request body:**

```json
{ "api_key": "AIza…", "model": "gemini-2.5-flash" }
```

**Allowed models:** `gemini-3.5-flash`, `gemini-3.0-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`.

**Response 200:** `{"message": "Configuration updated successfully"}`

---

## `/api/data`

### `GET /data/summary`

Latest day's snapshot from the CSV.

**Response 200:**

```json
{
  "date": "2026-06-25",
  "new_enterpriser_count": 142,
  "sales_ep_thousand_idr": 28450.5,
  "online_transactions": 891,
  "offline_transactions": 412
}
```

### `GET /data/table?limit=50&offset=0`

Paginated table view, newest-first.

**Query params:** `limit` (default 50), `offset` (default 0).

**Response 200:**

```json
{
  "total": 1631,
  "offset": 0,
  "limit": 50,
  "records": [
    {
      "date": "2026-06-25",
      "is_promo_period": 0.0,
      "day_of_week": "Thursday",
      "new_enterpriser_count": 142,
      "new_bee_count": 87,
      "transaction_volume_online": 891,
      "transaction_volume_offline": 412,
      "sales_ep_thousand_idr": 28450.5,
      "top_product_id": "P-100"
    }
  ]
}
```

### `GET /data/recent`

Last 10 rows, newest-first.

**Response 200:** array of the same row shape as `/data/table` → `records[]`.

### `GET /data/chart?days=90`

Column-oriented payload optimized for chart rendering — one array per metric.

**Query params:** `days` (default 90, tail of the dataset).

**Response 200:**

```json
{
  "dates": ["2026-03-28", "..."],
  "new_enterpriser_count": [120, ...],
  "new_bee_count": [60, ...],
  "transaction_volume_online": [800, ...],
  "transaction_volume_offline": [400, ...],
  "sales_ep_thousand_idr": [25000.0, ...],
  "is_promo_period": [0.0, ...]
}
```

### `POST /data/ingest`

Append a single row to the CSV. `day_of_week` is auto-derived from `date` if omitted.

**Request body:**

```json
{
  "date": "2026-06-26",
  "is_promo_period": 1.0,
  "new_enterpriser_count": 200,
  "new_bee_count": 95,
  "transaction_volume_online": 950,
  "transaction_volume_offline": 450,
  "sales_ep_thousand_idr": 30000.0,
  "top_product_id": "P-100"
}
```

**Response 200:** `{"message": "Row for 2026-06-26 ingested successfully."}`

---

## `/api/ml`

MLOps routes. The trained model is a `RandomForestRegressor(n_estimators=200, random_state=42)` over the 10 features described in [ARCHITECTURE.md](ARCHITECTURE.md#forecast--apiforecastenterprisersdays7).

### `GET /ml/metrics`

Train on the full dataset minus the last 30 days, then evaluate on those 30 days. Returns MAE / RMSE / MAPE plus a coarse status flag (`Healthy` if MAE < 50, else `Drifting`). Also reports the number of stored artifacts and the latest version.

**Response 200:**

```json
{
  "mae": 18.7,
  "rmse": 24.3,
  "mape": 14.2,
  "status": "Healthy",
  "artifact_count": 3,
  "latest_version": 3
}
```

### `POST /ml/train`

Train a new model version, evaluate against the 30-day holdout, and persist as `models_store/model_v{N}.joblib`. Appends an entry to `metadata.json`.

**Response 200:**

```json
{
  "message": "Model v4 trained and saved as model_v4.joblib.",
  "artifact": {
    "version": 4,
    "trained_at": "2026-06-26 14:32 UTC",
    "features": ["is_promo_period", "dow", "..."],
    "training_rows": 1601,
    "metrics": {"mae": 18.7, "rmse": 24.3, "mape": 14.2},
    "status": "Healthy",
    "file": "model_v4.joblib"
  },
  "metrics": {"mae": 18.7, "rmse": 24.3, "mape": 14.2, "status": "Healthy"}
}
```

### `GET /ml/artifacts`

List all trained model artifacts, newest-first.

**Response 200:**

```json
{
  "artifacts": [
    { "version": 4, "trained_at": "...", "metrics": {...}, "status": "Healthy", "file": "model_v4.joblib", ... },
    { "version": 3, ... }
  ]
}
```

---

## `/api/forecast`

### `GET /forecast/enterprisers?days=7`

Iterative 7-day (or N-day) forecast of `new_enterpriser_count`. Each predicted value is appended to the rolling window before the next prediction.

**Query params:** `days` (default 7).

**Response 200:**

```json
{
  "dates": ["2026-06-26", "2026-06-27", "..."],
  "forecasted_new_enterprisers": [148.0, 152.0, "..."]
}
```

---

## `/api/chat`

Persistent chat sessions backed by SQLite. The agent uses Gemini configured via `/admin/config`.

### `POST /chat/sessions`

Create a new session.

**Request body:** `{"title": "My investigation"}`

**Response 200:** `{"id": 7, "title": "My investigation", "messages": []}`

### `GET /chat/sessions`

List all sessions, newest-first. `messages` is always empty in the list view — fetch a specific session to get its messages.

**Response 200:** `[{"id": 7, "title": "My investigation", "messages": []}, ...]`

### `GET /chat/sessions/{session_id}`

Full session including ordered message history.

**Response 200:**

```json
{
  "id": 7,
  "title": "My investigation",
  "messages": [
    {"id": 12, "role": "user",  "content": "Berapa total Enterpriser baru minggu ini?"},
    {"id": 13, "role": "agent", "content": "Minggu ini (20–26 Juni) tercatat 924 Enterpriser baru..."}
  ]
}
```

### `POST /chat/sessions/{session_id}/ask`

Send a question. The user message is persisted, the agent is called with the prior history as context, and the agent's HTML answer is persisted and returned. Trend/forecast questions may include an embedded Plotly chart placeholder.

**Request body:** `{"question": "Tunjukkan tren EP penjualan 30 hari terakhir"}`

**Response 200:**

```json
{
  "response": "<p>Tren penjualan EP selama 30 hari terakhir menunjukkan...</p><div class=\"plotly-chart-container\" data-bconfig=\"eyJkYXRhIjpb...\"></div>"
}
```

If no Gemini API key is configured, the response is `{"response": "Please configure your Gemini API Key in the Admin Widget first."}`.

### `DELETE /chat/sessions/{session_id}`

Delete a session and its messages.

**Response 200:** `{"message": "Session deleted successfully"}`

---

## `/api/notebook`

In-process Jupyter-style kernel. State (variables, imports) persists per `session_id` for the lifetime of the server process.

### `POST /notebook/execute`

Execute a cell. Lines starting with `!` are run as shell commands inside `hive_project/`; everything else is Python in the per-session namespace.

**Request body:**

```json
{ "session_id": "session_abc123", "code": "df = load_data()\ndf.shape" }
```

**Response 200:**

```json
{
  "stdout": "(1631, 9)\n",
  "stderr": "",
  "error": null,
  "images": ["<base64 PNG of any matplotlib figure>", "..."]
}
```

On a Python exception, `error` is the full traceback string and the other fields are empty.

### `DELETE /notebook/session/{session_id}`

Clear the kernel namespace for `session_id`. Use this to "Restart kernel".

**Response 200:** `{"message": "Session session_abc123 cleared."}`

### `GET /notebook/kernel-info`

Read-only info about the Python process running the kernel.

**Response 200:**

```json
{ "python_version": "3.12.13", "python_executable": "/.../python3.12", "platform": "Darwin" }
```

### `GET /notebook/files`

Return the directory tree rooted at `notebooks/`. Hidden files and `__pycache__` are filtered.

**Response 200:**

```json
{
  "root": "notebooks",
  "files": [
    {
      "name": "data",
      "path": "notebooks/data",
      "type": "dir",
      "children": [{"name": "hdi_daily_ops.csv", "path": "notebooks/data/hdi_daily_ops.csv", "type": "file", "ext": ".csv"}]
    },
    {"name": "exploration.ipynb", "path": "notebooks/exploration.ipynb", "type": "file", "ext": ".ipynb"}
  ]
}
```

### `GET /notebook/files/content?path=notebooks/exploration.ipynb`

Read a file's text content. Paths must resolve inside `notebooks/`.

**Response 200:** `{"content": "...", "name": "exploration.ipynb", "path": "notebooks/exploration.ipynb"}`

**Response 400:** `{"detail": "Invalid path"}` (escapes `notebooks/`)
**Response 404:** `{"detail": "File not found"}`

### `POST /notebook/files`

Create a file or directory under `notebooks/`. Set `is_dir=true` to create a folder; otherwise `content` is written to the new file.

**Request body:**

```json
{ "path": "notebooks/scratch.py", "is_dir": false, "content": "# new file\n" }
```

**Response 200:** `{"path": "notebooks/scratch.py", "created": true}`
**Response 409:** `{"detail": "Already exists"}`

### `PUT /notebook/files/content`

Write content to an existing file. Used by the in-app notebook to save edits, and by the file-editor modal for plain text files.

**Request body:** `{ "path": "notebooks/exploration.ipynb", "content": "{...full nbformat JSON...}" }`

**Response 200:** `{"path": "notebooks/exploration.ipynb", "saved": true}`

### `DELETE /notebook/files?path=notebooks/scratch.py`

Delete a file or recursively delete a directory.

**Response 200:** `{"path": "notebooks/scratch.py", "deleted": true}`

---

## Error format

FastAPI's default error envelope is `{"detail": "..."}` for all 4xx and 5xx responses. The `detail` field is either a string (most endpoints) or a structured validation error array (when Pydantic rejects a body).

---

## OpenAPI schema

The machine-readable spec is served at `http://127.0.0.1:8088/openapi.json`. The Swagger UI explorer is at `/docs` and ReDoc at `/redoc`.
