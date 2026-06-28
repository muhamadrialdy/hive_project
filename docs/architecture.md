# Architecture

HIVE is a three-tier system: a React + Vite single-page app, a FastAPI backend, and an embedded in-process notebook kernel. State lives in a local SQLite file (`hive.db`) and on disk (CSV dataset, trained model artifacts, user notebooks). The only external dependency is the Google Gemini API, which is called on demand from the chat agent.

The platform supports multiple users with role-based access: **super admins** have access to all widgets (Data Management, MLOps, Gemini Agent, Documentation, Users, Settings), while **regular users** see only Gemini Agent and Documentation.

This page follows the C4 model — system context → containers → components → key data flows.

[[toc]]

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

The user has no other touchpoints — there is no email notification, no scheduled report, and no upstream data feed. The CSV dataset is updated manually or via the `/api/data/ingest` endpoint.

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

The single API process owns: the FastAPI app, the in-process Python namespace each notebook session executes in, and all I/O against the disk stores. The only remote dependency is Gemini.

::: warning Trust boundary
The notebook kernel runs in the same Python process as the API and uses `exec(compile(...), namespace)` with no sandboxing. Users can `import os`, hit the filesystem, or call shell commands via the `!` prefix. Acceptable for local single-user development — must be sandboxed before any public deployment. See [Production considerations](/guide/production#2-notebook-cell-execution-is-unsandboxed).
:::

## C3 — Backend components

The backend has four layers. Each endpoint module delegates to one or two services; services own the actual logic and I/O.

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

The dotted edges show direct persistence access from routers that don't go through a service (auth/admin/chat write to SQLite via SQLAlchemy; ml writes joblib artifacts; notebook does its own file I/O).

### Endpoint-to-service map

| Router | Endpoints | Key services |
|---|---|---|
| `/api/auth` | `POST /login`, `POST /register`, `GET /me` | `User` model, password hash, JWT |
| `/api/admin` | `GET/POST /config`, user management | `Config` model, `User` model (super-admin only) |
| `/api/data` | `/status`, `/table`, `/chart`, `/upload`, `/ingest` | `data_pipeline` |
| `/api/ml` | `/metrics`, `/train`, `/artifacts` | `data_pipeline`, sklearn, joblib |
| `/api/forecast` | `/enterprisers` | `forecasting` |
| `/api/chat` | session CRUD, `/sessions/{id}/ask` (auth required) | `llm_agent`, `ChatSession`, `ChatMessage` |
| `/api/notebook` | `/execute`, file tree CRUD, kernel info | In-process namespace, file I/O on `notebooks/` |

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

The LLM never sees raw rows in the response body — only inside the system instruction. Plotly charts are pre-rendered server-side as JSON, base64-encoded into a `<div data-bconfig="...">` placeholder, then hydrated client-side.

### Forecast: `GET /api/forecast/enterprisers?days=7`

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

The 10 features:

| Group | Features |
|---|---|
| Autoregressive lags | `lag_1`, `lag_3`, `lag_7`, `lag_14` |
| Rolling momentum | `rolling_mean_7`, `rolling_std_7` |
| Calendar | `dow`, `is_weekend`, `month` |
| Exogenous | `is_promo_period` |

Rolling stats use `shift(1)` before the window to prevent leakage of the current day's value into its own prediction.

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

The kernel namespace persists for the session — variables defined in cell N are available in cell N+1. `DELETE /notebook/session/{id}` drops the namespace.

## Frontend structure

```mermaid
graph TD
    main[main.tsx] --> auth[AuthContext]
    main --> app[App.tsx]
    app --> login[Login]
    app --> dash[Dashboard]

    subgraph super_admin_only[Super Admin Only]
        data_w[DataWidget]
        ml_w[MLWidget]
        users_w[UsersWidget]
        admin_w[AdminWidget]
    end

    subgraph all_users[All Users]
        chat_w[ChatWidget]
        docs_w[DocsWidget]
    end

    dash --> super_admin_only
    dash --> all_users
    ml_w --> nb[NotebookWidget]
    docs_w -.iframe.-> docs["/docs/index.html"]

    classDef widget fill:#fff3e0,stroke:#f57c00,color:#e65100
    classDef restricted fill:#ffebee,stroke:#c62828,color:#b71c1c
    class data_w,ml_w,chat_w,docs_w,admin_w,users_w,nb widget
    class super_admin_only restricted
```

The Dashboard filters navigation based on the user's role (`super_admin` or `user`). Regular users default to the Gemini Agent tab.

All widgets are self-contained -- they fetch their own data via axios. There is no global data store. The only shared state is the auth token and user profile in `AuthContext`.

## Persistence model

| Store | Location | Schema / format | Lifecycle |
|---|---|---|---|
| User auth | `hive.db` → `users` | `id`, `email`, `hashed_password`, `role`, `status` | Registration creates pending user; super admin approves |
| App config | `hive.db` → `config` | `key`, `value` (`GEMINI_API_KEY`, `GEMINI_MODEL`) | Updated by admin endpoint |
| Chat sessions | `hive.db` → `chat_sessions`, `chat_messages` | `id`, `user_id`, `title`, `role` (`user`/`agent`), `content`, `created_at` | Per-user; title auto-set from first 5 words of initial message |
| Operational data | `notebooks/data/*.csv` (latest mtime), fallback `data/hdi_daily_ops.csv` | Daily ops CSV | Appended via `/api/data/ingest` |
| Model artifacts | `app/models_store/model_v*.joblib` + `metadata.json` | Pickled `RandomForestRegressor` + metrics, features, timestamp | New version on each `/api/ml/train` |
| Notebooks | `notebooks/*.ipynb`, `notebooks/*.py` | nbformat 4.x or plain Python | Created / edited / saved via `/api/notebook` |
| Notebook kernel state | In-memory `_kernels: dict[session_id, namespace]` | Plain Python dict | Lost on server restart |

## Configuration

Settings live in `app/core/config.py` and load from a `.env` file if present.

| Setting | Default | Notes |
|---|---|---|
| `PROJECT_NAME` | `"HIVE API"` | Shown in OpenAPI title |
| `GEMINI_API_KEY` | `""` | Bootstrap value; in-app admin override takes precedence |

The Gemini model name is **not** in env settings — it lives in the `config` table via the admin UI.

## Known limitations

See [Production considerations](/guide/production) for the full list. Quick summary:

- Notebook execution is unsandboxed
- CORS is wide open in development
- JWT is enforced on chat endpoints; other routes still unprotected
- Model is retrained on every forecast request
