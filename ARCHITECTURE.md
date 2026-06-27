# Architecture

HIVE is a three-tier system: a React + Vite single-page app, a FastAPI backend, and an embedded in-process notebook kernel. State lives in a local SQLite file (`hive.db`) and on disk (CSV dataset, trained model artifacts, user notebooks). The only external dependency is the Google Gemini API, which is called on demand from the chat agent.

This document follows the C4 model — system context → containers → components → key data flows.

---

## C1 — System context

```mermaid
graph LR
    user[HDI Business Leader]
    hive[HIVE Platform]
    gemini[Google Gemini API]

    user -- "browses data,<br/>asks questions" --> hive
    hive -- "prompt + context" --> gemini
    gemini -. "markdown answer" .-> hive
    hive -. "dashboard + chat" .-> user

    classDef person fill:#08427b,stroke:#073b6f,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#cfd8dc,stroke:#607d8b,color:#263238
    class user person
    class hive system
    class gemini external
```

The user has no other touchpoints — there is no email notification, no scheduled report, and no upstream data feed. The CSV dataset is updated manually or via the ingest endpoint.

---

## C2 — Container view

```mermaid
graph TD
    user([User])
    spa[React SPA<br/>:5173]
    api[FastAPI<br/>:8088]
    kernel[Notebook kernel<br/>in-process]
    sqlite[(SQLite)]
    stores[("Disk stores<br/>CSV, notebooks, models")]
    gemini[Google Gemini API]

    user --> spa
    spa -- "REST /api/*" --> api
    api -- SQLAlchemy --> sqlite
    api -- read/write --> stores
    api -- exec cell --> kernel
    api -- "chat" --> gemini

    classDef browser fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef server fill:#fff3e0,stroke:#f57c00,color:#e65100
    classDef store fill:#f1f8e9,stroke:#558b2f,color:#33691e
    classDef external fill:#eceff1,stroke:#607d8b,color:#263238
    class spa browser
    class api,kernel server
    class sqlite,stores store
    class gemini external
```

Notes:

- **CORS is fully open** (`allow_origins=["*"]` in [app/main.py](app/main.py)) — fine for local development, must be tightened before any deployment.
- **The notebook kernel runs in the same Python process as the API.** Cell execution uses `exec(compile(...), namespace)` with a per-session namespace dict. There is no sandboxing — users can `import os`, hit the filesystem, or call shell commands via the `!` prefix.
- **SQLite is created on first request** by `Base.metadata.create_all(bind=engine)` in `main.py`.

---

## C3 — Backend components

```mermaid
graph TD
    subgraph api[API layer · app/api/endpoints/]
        direction LR
        auth & admin & data & ml & forecast & chat & notebook
    end

    subgraph svc[Service layer · app/services/]
        direction LR
        pipeline[data_pipeline]
        forecasting
        llm[llm_agent]
    end

    subgraph store[Persistence]
        direction LR
        sqlite[(SQLite)]
        csv[(CSV)]
        artifacts[(models_store)]
        nbdir[(notebooks)]
    end

    api --> svc
    svc --> store
    auth & admin & chat -.SQLAlchemy.-> sqlite
    ml -.joblib.-> artifacts
    notebook -.file I/O.-> nbdir

    classDef api fill:#fff3e0,stroke:#f57c00,color:#e65100
    classDef svc fill:#e8f5e9,stroke:#43a047,color:#1b5e20
    classDef store fill:#f1f8e9,stroke:#558b2f,color:#33691e
    class auth,admin,data,ml,forecast,chat,notebook api
    class pipeline,forecasting,llm svc
    class sqlite,csv,artifacts,nbdir store
```

### Endpoint-to-service map

| Router | Endpoints | Key services |
|---|---|---|
| `/api/auth` | `POST /login` | `User` model, password hash, JWT |
| `/api/admin` | `GET/POST /config` | `Config` model (Gemini API key + model name) |
| `/api/data` | `/summary`, `/table`, `/recent`, `/chart`, `/ingest` | `data_pipeline` |
| `/api/ml` | `/metrics`, `/train`, `/artifacts` | `data_pipeline`, sklearn, joblib |
| `/api/forecast` | `/enterprisers` | `forecasting` |
| `/api/chat` | session CRUD, `/sessions/{id}/ask` | `llm_agent`, `ChatSession`, `ChatMessage` |
| `/api/notebook` | `/execute`, file tree CRUD, kernel info | In-process namespace, file I/O on `notebooks/` |

---

## Key data flows

### Chat: user asks "Tunjukkan tren EP penjualan 30 hari terakhir"

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant API as /api/chat
    participant SVC as Services
    participant G as Gemini

    U->>FE: types question
    FE->>API: POST /sessions/{id}/ask
    API->>API: load history + Gemini config (SQLite)
    API->>SVC: ask_hive_agent(question, history)
    SVC->>SVC: load_and_clean_data()<br/>get_full_summary_stats()<br/>get_forecast(7)
    SVC->>G: contents + system_instruction
    G-->>SVC: markdown answer
    SVC->>SVC: detect intent → embed Plotly chart div
    SVC-->>API: HTML answer
    API->>API: persist agent message (SQLite)
    API-->>FE: { response }
    FE-->>U: text + hydrated Plotly chart
```

The LLM never sees raw rows in the response body — only inside the system instruction. Plotly charts are pre-rendered server-side as JSON and base64-encoded into a `<div data-bconfig="...">` placeholder; the React side detects the placeholder and instantiates Plotly client-side.

### Forecast: `/api/forecast/enterprisers?days=7`

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as /api/forecast
    participant FC as forecasting

    FE->>API: GET /enterprisers?days=7
    API->>FC: get_forecast(7)
    FC->>FC: load CSV, build 10 features
    FC->>FC: train RandomForest (n=200)
    loop days
        FC->>FC: predict, append to window
    end
    FC-->>API: { dates, forecasted_new_enterprisers }
    API-->>FE: ForecastResult
```

The forecast is **iterative**: each predicted value is appended to a rolling window of the last 14 observations, so day N+1's `lag_1` is day N's prediction. This compounds error but is the only way to forecast more than one step ahead without future ground truth.

Note: the model is retrained on every request (~100ms on this dataset). For production, swap to loading the latest `models_store/*.joblib` artifact and only retraining via `/api/ml/train`.

### Notebook cell execution

```mermaid
sequenceDiagram
    participant FE as NotebookWidget
    participant API as /api/notebook
    participant K as Kernel namespace

    FE->>API: POST /execute { session_id, code }
    alt new session
        API->>K: bootstrap (pandas, numpy, mpl, load_data)
    end
    API->>API: split python / shell chunks
    loop each chunk
        alt python
            API->>K: exec(compile(chunk))
        else shell (line starts with !)
            API->>API: subprocess.run
        end
    end
    API->>API: capture stdout, stderr, mpl PNGs (base64)
    API-->>FE: { stdout, stderr, error, images[] }
```

The kernel namespace persists for the session — variables defined in cell N are available in cell N+1. Clearing the session (`DELETE /session/{id}`) drops the namespace and the user starts fresh.

---

## Frontend structure

```mermaid
graph TD
    main[main.tsx] --> auth[AuthContext]
    main --> app[App.tsx]
    app --> login[Login]
    app --> dash[Dashboard]
    dash --> data_w[DataWidget]
    dash --> ml_w[MLWidget]
    dash --> chat_w[ChatWidget]
    dash --> docs_w[DocsWidget]
    dash --> admin_w[AdminWidget]
    ml_w --> nb[NotebookWidget]
    docs_w -.iframe.-> docs["/docs/index.html"]

    classDef widget fill:#fff3e0,stroke:#f57c00,color:#e65100
    class data_w,ml_w,chat_w,docs_w,admin_w,nb widget
```

All widgets are self-contained — they fetch their own data via axios against `http://127.0.0.1:8088`. There is no global data store. The only shared state is the auth token (in `AuthContext`).

---

## Persistence model

| Store | Location | Schema / format | Lifecycle |
|---|---|---|---|
| User auth | `hive.db` → `users` | `id`, `email`, `hashed_password` | First-time login creates and sets password |
| App config | `hive.db` → `config` | `key`, `value` (rows for `GEMINI_API_KEY`, `GEMINI_MODEL`) | Updated by admin endpoint |
| Chat sessions | `hive.db` → `chat_sessions`, `chat_messages` | `id`, `title`, `role` (`user`/`agent`), `content`, `created_at` | Permanent until explicit delete |
| Operational data | `notebooks/data/*.csv` (latest mtime), fallback `data/hdi_daily_ops.csv` | Daily ops CSV — see column list in [app/services/data_pipeline.py](app/services/data_pipeline.py) | Appended via `/api/data/ingest` |
| Model artifacts | `app/models_store/model_v*.joblib` + `metadata.json` | Pickled `RandomForestRegressor` + metrics, features, timestamp | New version on each `/api/ml/train` |
| Notebooks | `notebooks/*.ipynb`, `notebooks/*.py` | nbformat 4.x or plain Python | Created / edited / saved via `/api/notebook` |
| Notebook kernel state | In-memory `_kernels: dict[session_id, namespace]` | Plain Python dict | Lost on server restart |

---

## Configuration

Settings live in [app/core/config.py](app/core/config.py) and load from a `.env` file if present.

| Setting | Default | Notes |
|---|---|---|
| `PROJECT_NAME` | `"HIVE API"` | Shown in OpenAPI title |
| `GEMINI_API_KEY` | `""` | Bootstrap value; in-app admin override takes precedence |

The Gemini model name is **not** in env settings — it is persisted in the `config` table via the admin UI.

---

## Known limitations

- **No sandbox on notebook execution.** Cells run in-process with full filesystem and network access. Acceptable for local single-user development; do not expose this endpoint publicly without isolation (Docker, gVisor, restricted user).
- **Model trained on every `/api/forecast` call.** Cheap on this dataset, expensive at scale. Production should serve from `models_store/` artifacts.
- **CORS is wide open** in `main.py`. Restrict before any deployment.
- **Single-user auth.** The login endpoint hard-codes `admin.hive@gmail.com` as the only allowed account.
- **Plotly chart embeds are HTML-in-text** — the agent answer is rendered with `dangerouslySetInnerHTML` semantics on the frontend. Any LLM output that contains a `<div data-bconfig="…">` will be parsed. Tight system instruction prevents abuse, but treat the boundary as untrusted.
