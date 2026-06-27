# syntax=docker/dockerfile:1.7
# HIVE backend image — FastAPI + uv

FROM python:3.12-slim AS base

# uv reads PATH from /root/.local/bin once installed via pip
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# System deps for scikit-learn / matplotlib wheels (most ship pure wheels, but
# keep build-essential available for niche source builds).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Astral's installer)
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install dependencies first — separate layer for cache reuse
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# Now copy application code
COPY app ./app
COPY main.py ./
COPY data ./data
COPY notebooks ./notebooks
COPY scripts ./scripts

# Install the project itself (no-op if not a package, just ensures uv is happy)
RUN uv sync --frozen

EXPOSE 8088

# main.py reads HOST/PORT from .env via app.core.config.settings
CMD ["uv", "run", "python", "main.py"]
