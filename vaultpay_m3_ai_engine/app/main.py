"""
VaultPay – FastAPI Application Entry Point
==========================================
Wires together all routes, middleware, CORS, and startup events.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.security import require_internal_key

from app.core.config import get_settings
from app.api.routes import projects, files, verification, paypal
from app.services.evidence_indexer import ensure_index_exists
from app.db.base import init_db

settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Create the FastAPI app with metadata for the Swagger UI
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VaultPay",
    description=(
        "AI-powered milestone verification and PayPal escrow engine for freelance projects. "
        "Built for the PayPal Hackathon."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: CORS middleware (allow the React frontend to connect)
# ─────────────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Section 2b: every route except /health needs the internal key (constant time).
# The API is the only caller; there is no CORS on this service.
app.middleware("http")(require_internal_key)


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Startup event – ensure Elasticsearch index exists and init DB
# ─────────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    """Run on startup: auto-create database tables and ES index."""
    try:
        await init_db()
    except Exception as e:
        print(f"[WARN] Database initialization notice: {e}")

    try:
        await ensure_index_exists()
    except Exception as e:
        # Non-fatal: ES might not be running in dev mode
        print(f"[WARN] Could not connect to Elasticsearch on startup: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Register all routers
# ─────────────────────────────────────────────────────────────────────────────
app.include_router(projects.router)
app.include_router(files.router)
app.include_router(verification.router)
app.include_router(paypal.router)


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Root & Health check endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    """Milestone 3 API root status."""
    return {
        "app": "VaultPay Milestone 3 Engine",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "modules": [
            "AI Contract & Acceptance Criteria Parser",
            "Safe File Extraction & Provenance Pipeline",
            "Hybrid Evidence Indexer",
            "Deterministic AST Code & Web Checks",
            "Explainable AI Verdict Generator",
            "PayPal Human-Guard Escrow"
        ]
    }

@app.get("/health", tags=["Health"])
async def health():
    """Basic health check – returns OK if the server is running."""
    database_healthy = True
    try:
        from sqlalchemy import text

        from app.db.base import engine

        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
    except Exception:
        database_healthy = False

    return {
        "status": "ok" if database_healthy else "degraded",
        "service": "vaultlance-ai-engine",
        "version": "1.0.0",
        "databaseHealthy": database_healthy,
    }
