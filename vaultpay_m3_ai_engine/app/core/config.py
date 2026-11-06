"""
VaultPay – Application Settings
================================
All configuration is loaded from environment variables (or a .env file).
Pydantic-settings handles validation and type casting automatically.
"""

import secrets

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Settings model – every env variable used in the app lives here
# ─────────────────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── App ──────────────────────────────────────────────────────────────────
    app_env: str = "development"
    # No default literal: a shipped secret is one every reader of this repo has.
    secret_key: str = ""

    @model_validator(mode="after")
    def _resolve_secret_key(self) -> "Settings":
        if len(self.secret_key) >= 32:
            return self
        if self.app_env.lower() == "production":
            raise ValueError(
                "SECRET_KEY must be set to at least 32 characters in production. "
                "Refusing to start. See docs/deploy-secrets.md."
            )
        object.__setattr__(self, "secret_key", secrets.token_urlsafe(48))
        print(
            "[config] SECRET_KEY missing or short; generated a per-process "
            "development value. Sessions end on restart."
        )
        return self
    allowed_origins: str = "http://localhost:3000"

    # ── Database (SQLite by default, override with PostgreSQL in .env) ───────
    database_url: str = "sqlite+aiosqlite:///./vaultpay.db"
    database_sync_url: str = "sqlite:///./vaultpay.db"

    # ── Elasticsearch ─────────────────────────────────────────────────────────
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_index_chunks: str = "vaultpay_chunks"

    # ── Anthropic Claude ──────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    claude_model: str = "claude-3-opus-20240229"
    claude_max_tokens: int = 4096

    # ── PayPal Sandbox ────────────────────────────────────────────────────────
    paypal_mode: str = "sandbox"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""

    # ── Redis / Celery ────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── File upload limits ────────────────────────────────────────────────────
    max_upload_size_mb: int = 50
    max_zip_expanded_mb: int = 200
    max_zip_entry_count: int = 500
    max_zip_nesting_depth: int = 3
    upload_dir: str = "uploads"
    temp_extract_dir: str = "/tmp/vaultpay_extract"

    # ── Versioning (bump when prompts or extractors change) ───────────────────
    prompt_version: str = "1.0.0"
    extractor_version: str = "1.0.0"


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Cached singleton – import `get_settings()` anywhere in the app
# ─────────────────────────────────────────────────────────────────────────────
@lru_cache()
def get_settings() -> Settings:
    return Settings()
