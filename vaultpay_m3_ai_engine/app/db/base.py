"""
VaultPay – SQLAlchemy Async Database Engine
============================================
Sets up the async engine, session factory and declarative base.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Async engine
# ─────────────────────────────────────────────────────────────────────────────
engine_kwargs = {
    "echo": (settings.app_env == "development"),
}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
    })

engine = create_async_engine(settings.database_url, **engine_kwargs)


async def init_db() -> None:
    """Auto-create tables on startup if they do not exist."""
    async with engine.begin() as conn:
        import app.models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Session factory
# ─────────────────────────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Declarative base – all models inherit from this
# ─────────────────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: FastAPI dependency – yields a session per request
# ─────────────────────────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
