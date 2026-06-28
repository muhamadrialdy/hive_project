---
layout: home

hero:
  name: HIVE
  text: HDI Intelligence & Value Engine
  tagline: Natural-language analytics for HDI business leaders — dashboards, forecasts, and a Gemini-powered chat agent over daily operational data.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: API reference
      link: /api

features:
  - title: Data ingestion and EDA
    details: Load, clean, and explore 1,631+ daily records from hdi_daily_ops.csv with a fully wired pandas pipeline.
  - title: 7-day forecast
    details: Random Forest with 10 features — autoregressive lags, rolling momentum, and calendar encoding — produced iteratively.
  - title: MLOps surface
    details: Train new model versions, list artifacts, and monitor MAE / RMSE / MAPE drift against a rolling 30-day holdout.
  - title: Conversational agent
    details: Gemini-backed chat with per-user sessions, auto-created on first message. Produces Bahasa Indonesia summaries plus inline Plotly charts.
  - title: Notebook workspace
    details: In-app .ipynb editor with markdown cell rendering, auto-save, execution counts, and round-trip back to nbformat JSON.
  - title: Role-based access
    details: Super admins access all widgets. Regular users see Gemini Agent and Documentation. Multi-user auth with registration and approval flow.
---

## What's in these docs

- **[Getting started](/guide/getting-started)** — install prerequisites, run the backend and frontend, configure the Gemini API key.
- **[Business findings](/guide/findings)** — the four headline insights from `exploration.ipynb`.
- **[Production considerations](/guide/production)** — what to harden before shipping.
- **[Architecture](/architecture)** — C4 diagrams, component map, key data flows, persistence model.
- **[API reference](/api)** — every endpoint with request and response examples.

## Project

This is the documentation site for the [HIVE platform](https://github.com/muhamadrialdy/hive_project). The source lives at `hive_project/` in the repository; the same content is served as `README.md`, `ARCHITECTURE.md`, and `API.md` for offline reading.

Author: **Muhamad Rialdy** — rialdi102@gmail.com
