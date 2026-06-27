# Getting started

HIVE is a three-tier system: a FastAPI backend, a React + Vite frontend, and an in-process notebook kernel. This page covers everything you need to run it locally.

## Prerequisites

- **Python 3.12+** with [`uv`](https://github.com/astral-sh/uv) installed
- **Node.js 20+**
- (Optional) a **Gemini API key** if you want the chat agent to answer questions

## Backend

```bash
cd hive_project
uv sync
cp .env.example .env       # edit HOST/PORT/CORS if needed
uv run python main.py      # reads .env, launches uvicorn with reload
```

Defaults to `http://127.0.0.1:8088`. The OpenAPI explorer is at `/docs`.

The first run creates `hive.db` (SQLite) in the project root and ensures the `users`, `config`, `chat_sessions`, and `chat_messages` tables exist.

::: tip Configurable bind
`HOST`, `PORT`, and `CORS_ORIGINS` are read from `.env` via [app/core/config.py](https://github.com/muhamadrialdy/hive_project/blob/main/app/core/config.py). `CORS_ORIGINS` is a comma-separated list (use `*` to allow any origin — development only).
:::

## Frontend

In a second terminal:

```bash
cd hive_project/hive_frontend
npm install
cp .env.example .env       # only if you changed the backend URL
npm run dev
```

The dev server runs on `http://localhost:VITE_PORT` (default `5173`) and calls the backend at `VITE_API_URL` (default `http://127.0.0.1:8088/api`). Both are configurable via `hive_frontend/.env`. If you change `VITE_PORT`, add the new origin to `CORS_ORIGINS` in the backend `.env`.

Open `http://localhost:5173` and log in with `admin.hive@gmail.com`. The password you type on the first attempt becomes the permanent password — there is no separate signup flow.

::: tip First-time login
If you mistype the password on the very first login, that mistyped value becomes permanent. Delete `hive.db` and restart the backend to reset.
:::

## Gemini API key

The chat agent stays disabled until a key is configured. Two ways to set it:

### Option A — in the app (recommended)

1. Open the dashboard, click **Settings & API** in the sidebar
2. Paste your API key and a model name (e.g. `gemini-2.5-flash`)
3. Save — the value is persisted to the `config` table in SQLite

### Option B — environment variable

```bash
export GEMINI_API_KEY="your-key"
uv run uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

The env value is loaded by `app/core/config.py` at startup but does **not** set the model name — use Option A or seed the `config` table directly.

## Tests

```bash
cd hive_project
uv run pytest app/tests/ -x -q
```

A post-edit hook ([scripts/post_edit_test.sh](https://github.com/muhamadrialdy/hive_project/blob/main/scripts/post_edit_test.sh)) runs the backend pytest suite on `.py` edits and frontend `tsc --noEmit` on `.ts/.tsx` edits when invoked from a Claude Code session.

## Common issues

**Port 8088 already in use.** Find and kill the existing process:

```bash
lsof -i :8088
kill -9 <pid>
```

If you change the backend port, you must also update the hardcoded `http://127.0.0.1:8088` references in `hive_frontend/src/components/widgets/*.tsx`.

**Frontend says "Failed to fetch".** The backend isn't running, or CORS is blocking. CORS is configured wide-open in `app/main.py` for local development; the more likely cause is the backend isn't listening on `8088`.

**Notebook cells render at the wrong height.** Hard-refresh the browser (`Cmd+Shift+R`). The auto-sizing logic uses the `rows` attribute and a `ResizeObserver` — older cached JS may behave differently.
