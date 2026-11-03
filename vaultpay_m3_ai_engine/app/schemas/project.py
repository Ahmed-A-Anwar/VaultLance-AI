"""
VaultPay – Pydantic Schemas
============================
Request/response models for the API.
Kept separate from SQLAlchemy models.
"""

from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Project schemas
# ─────────────────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    title: str
    brief: str


class ProjectOut(BaseModel):
    id: uuid.UUID
    title: str
    brief: str
    status: str
    agreement_version: int
    client_approved_criteria: bool
    freelancer_approved_criteria: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Acceptance criteria schemas
# ─────────────────────────────────────────────────────────────────────────────
class CriteriaApprovalIn(BaseModel):
    agreement_version: int  # Must match current project version


class ParsedCriteriaOut(BaseModel):
    project_id: str
    agreement_version: int
    criteria: list[dict[str, Any]]
    vague_terms_found: list[str]
