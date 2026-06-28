---
outline: [2, 3]
---

# Changelog

All notable changes to HIVE are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v0.3.0] -- 2026-06-28

### Added

- **Per-user chat sessions** -- `chat_sessions` table now includes a `user_id` column. Each user sees only their own sessions. Startup migration adds the column to existing databases.
- **Auto-session creation** -- users can send a message without creating a session first. A session is created automatically on the first message.
- **Auto-session titles** -- session title is derived from the first 5 words of the initial message. No manual title input required.
- **Role-based navigation** -- regular users (`role: user`) see only Gemini Agent and Documentation widgets. Super admins retain access to all widgets (Data Management, MLOps & Tuning, Users, Settings & API).
- **Markdown cell rendering in notebook** -- `.ipynb` markdown cells are now displayed as rendered HTML (headings, bold, italic, lists, inline code). Double-click or click the pencil icon to edit source. Markdown cells round-trip correctly on save.
- **Docker Compose dev override** (`docker-compose.dev.yml`) -- volume-mounts source code for hot reload. Backend uses uvicorn `--reload`; frontend uses Vite HMR. No rebuild needed for code changes.
- **Frontend dev Dockerfile** (`hive_frontend/Dockerfile.dev`) -- lightweight Node image running `vite --host` for development.
- **JWT enforcement on chat endpoints** -- all `/api/chat/*` routes now require a valid Bearer token via `get_current_user` dependency.

### Fixed

- **Auth header race condition on browser reload** -- the axios auth header was set in a `useEffect` (runs after children mount), so `ChatWidget.fetchSessions()` would fire unauthenticated and trigger a 401 logout. Header is now set at module load time.
- **Duplicate first message in auto-created sessions** -- the auto-create flow added the user message to the UI, then `sendToSession` added it again. Fixed with a `skipAppend` flag.

### Changed

- **Page title** renamed from `hive_frontend` to `Hive`.
- **`ChatSessionCreate.title`** is now optional (defaults to empty string).
- **Default tab** for regular users is `chat` instead of `data`.
- **Documentation** updated across all VitePress pages to reflect multi-user auth, role-based access, Docker dev workflow, and API changes.

---

## [v0.2.1] -- 2026-06-27

### Fixed

- **Forecast and feature importance chart overlap in MLWidget** -- resolved layout collision between the forecast chart and the feature importance chart.

---

## [v0.2.0] -- 2026-06-27

### Added

- **Docker Compose deployment** -- full three-container stack (backend, frontend+nginx, Redis); `docker compose up -d --build` is now the recommended setup path.
- **nginx reverse proxy** -- frontend container proxies `/api/*` to the backend; single-origin access at `http://localhost`.
- **Redis caching layer** (`app/services/cache.py`) -- TTL-based JSON cache with a `@ttl_cache` decorator. Degrades gracefully to a pass-through if Redis is unreachable (local dev without the cache container).
- **Notebook file management** -- file browser inside NotebookWidget supports create file, create folder, rename, delete, and open-in-editor actions for any file under `notebooks/`.
- **`.ipynb` file loading** -- clicking an `.ipynb` file in the file browser parses its code cells and loads them into the notebook editor; kernel session is reset on load.
- **File editor modal** -- non-notebook files (`.py`, `.csv`, `.txt`, ...) open in a full-screen modal with syntax-highlighted editing and Save / Discard flow.
- **`UsersWidget`** -- new admin widget for user management.
- **`hive_frontend/src/config.ts`** -- centralised API base-URL config for the frontend.

### Fixed

- **Notebook cells displayed as collapsed header bars** -- React controlled `<textarea>` does not auto-resize from the `rows` attribute when `value` is set programmatically. Replaced with a `CellCode` sub-component that uses `useLayoutEffect` + `scrollHeight` to resize after every render.
- **`KeyError: 'name'` on kernel bootstrap** -- `_BOOTSTRAP` used `.format(data_path=..., project_root=...)` but contained bare `{name}` and `{python}` inside an f-string body. Fixed by escaping as `{{name}}` / `{{python}}`.
- **Notebook widget had no height inside MLWidget flex column** -- changed root `div` from `height: '100%'` to `flex: 1, minHeight: 0`.
- **TypeScript build error in `MLWidget.tsx`** -- Recharts `Formatter` type passes `ValueType | undefined`, not `number`. Removed the explicit parameter annotation.

### Changed

- **Default notebook** changed from three example cells to a single starter cell; loading a file replaces the cell list entirely.
- **NotebookWidget toolbar** shows the currently-loaded filename as a monospace badge.
- **File browser** root is now `notebooks/` (was `notebooks/data/`), exposing the full notebook directory tree.
- **Backend `_NOTEBOOKS_DIR`** now points to `hive_project/notebooks/`; `_safe_path()` validates all file endpoints against this root to prevent path traversal.

---

## [v0.1.0] -- 2026-06-27

### Added

- Initial release of the HIVE platform.
- FastAPI backend with `/auth`, `/admin`, `/data`, `/ml`, `/forecast`, `/chat`, `/notebook` routers.
- React 19 + Vite + TypeScript frontend with DataWidget, MLWidget, ChatWidget, AdminWidget, DocsWidget.
- Random Forest 10-feature iterative 7-day forecast.
- Gemini-backed chat agent with inline Plotly chart generation.
- In-process notebook kernel (`exec` + per-session namespace) with `!`-prefix shell passthrough.
- VitePress documentation site embedded in the dashboard.
- SQLite persistence for users, config, chat sessions.
- `uv`-managed Python dependencies.
