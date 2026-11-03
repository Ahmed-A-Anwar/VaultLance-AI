"""
VaultPay – PayPalOrder Model
==============================
Tracks PayPal sandbox orders.  Payment is NEVER released automatically
by the AI – this table is only updated after explicit human approval.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, ForeignKey, DateTime, Enum as SAEnum, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.db.base import Base


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Enumerations
# ─────────────────────────────────────────────────────────────────────────────
class OrderStatus(str, enum.Enum):
    CREATED = "CREATED"
    APPROVED = "APPROVED"      # buyer approved on PayPal
    COMPLETED = "COMPLETED"    # captured – funds moved
    VOIDED = "VOIDED"
    FAILED = "FAILED"


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: PayPalOrder table
# ─────────────────────────────────────────────────────────────────────────────
class PayPalOrder(Base):
    __tablename__ = "paypal_orders"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to project
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # PayPal identifiers
    paypal_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    # Amount
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # Status
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status"), default=OrderStatus.CREATED
    )

    # Raw PayPal response (for debugging)
    raw_response: Mapped[str | None] = mapped_column(Text)

    # Guard: the AI CANNOT set this to True – only a human-triggered API endpoint can
    human_release_approved: Mapped[bool] = mapped_column(default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationship
    project: Mapped["Project"] = relationship("Project", back_populates="paypal_orders")
