# Changelog

All notable changes to HIVE are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v0.2.0] — 2026-06-27

### Added

- **Docker Compose deployment** — full three-container stack (backend, frontend+nginx, Redis); `docker compose up -d --build` is now the recommended setup path.
- **nginx reverse proxy** — frontend container proxies `/api/*` to the backend; single-origin access at `http://localhost`.
- **Redis caching layer** (`app/services/cache.py`) — TTL-based JSON cache with a `@ttl_cache` decorator. Degrades gracefully to a pass-through if Redis is unreachable (local dev without the cache container).
- **Notebook file management** — file browser inside NotebookWidget supports create file, create folder, rename, delete, and open-in-editor actions for any file under `notebooks/`.
- **`.ipynb` file loading** — clicking an `.ipynb` file in the file browser parses its code cells and loads them into the notebook editor; kernel session is reset on load.
- **File editor modal** — non-notebook files (`.py`, `.csv`, `.txt`, …) open in a full-screen modal with syntax-highlighted editing and Save / Discard flow.
- **`UsersWidget`** — new admin widget for user management.
- **`hive_frontend/src/config.ts`** — centralised API base-URL config for the frontend.

### Fixed

- **Notebook cells displayed as collapsed header bars** — React controlled `<textarea>` does not auto-resize from the `rows` attribute when `value` is set programmatically. Replaced with a `CellCode` sub-component that uses `useLayoutEffect` + `scrollHeight` to resize after every render. All 20 cells from `exploration.ipynb` now show their full code content on load.
- **`KeyError: 'name'` on kernel bootstrap** — `_BOOTSTRAP` used `.format(data_path=…, project_root=…)` but contained bare `{name}` and `{python}` inside an f-string body. Fixed by escaping as `{{name}}` / `{{python}}` so they survive the `.format()` call and are evaluated later at `exec` time.
- **Notebook widget had no height inside MLWidget flex column** — changed root `div` from `height: '100%'` to `flex: 1, minHeight: 0`; added a `flex: 1` wrapper in `MLWidget` around the notebook tab. Cells and output now scroll correctly.
- **TypeScript build error in `MLWidget.tsx`** — Recharts `Formatter` type passes `ValueType | undefined` (which includes `readonly (string | number)[]`), not `number`. Removed the explicit parameter annotation to let TypeScript infer `any`, satisfying the overload without a cast.

### Changed

- **Default notebook** changed from three example cells to a single starter cell; loading a file replaces the cell list entirely.
- **NotebookWidget toolbar** shows the currently-loaded filename as a monospace badge.
- **File browser** root is now `notebooks/` (was `notebooks/data/`), exposing the full notebook directory tree.
- **Backend `_NOTEBOOKS_DIR`** now points to `hive_project/notebooks/`; `_safe_path()` validates all file endpoints against this root to prevent path traversal.

---

## [v0.1.0] — 2026-06-01

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
