from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "HIVE API"

    # Server bind
    HOST: str = "127.0.0.1"
    PORT: int = 8088

    # Comma-separated list of origins allowed by CORS, or "*" for any origin.
    # Local dev default covers the Vite frontend.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # JWT signing. CHANGE THIS in production .env — the hardcoded default
    # exists only so the app boots in fresh dev environments. A leaked key
    # means anyone can forge a valid login token.
    SECRET_KEY: str = "hive-dev-only-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # SQLAlchemy URL for the metadata DB. Default is a SQLite file in CWD;
    # in Docker we point this at a volume-mounted path.
    DATABASE_URL: str = "sqlite:///./hive.db"

    # Redis cache for compute-heavy lookups (stats + forecast). Empty value disables
    # caching — the app falls back to recomputing on every call.
    REDIS_URL: str = ""

    # Google Gemini (in-app admin override takes precedence — see /api/admin/config)
    GEMINI_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
