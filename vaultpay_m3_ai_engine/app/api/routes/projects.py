"""
VaultPay – FastAPI Route: Projects & Criteria
=============================================
Handles:
  - Creating a project (brief submitted by client)
  - Parsing the brief to structured criteria using Claude
  - Client approval of criteria
  - Freelancer approval of criteria
  - Fetching project details

Security:
  - Both parties must approve the same criteria version
  - When both approve, an agreement_hash is stored for tamper-evidence
"""

import hashlib
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.project import Project, AcceptanceCriterion, ProjectStatus, CriteriaSeverity
from app.schemas.project import (
    ProjectCreate, ProjectOut,
    CriteriaApprovalIn, ParsedCriteriaOut,
)
from app.services.criteria_parser import parse_brief_to_criteria
from app.core.config import get_settings

router = APIRouter(prefix="/projects", tags=["Projects"])
settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Create a new project
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new project.  The brief is stored as-is.
    Criteria extraction is triggered separately via POST /projects/{id}/parse-criteria.
    """
    project = Project(
        title=payload.title,
        brief=payload.brief,
        status=ProjectStatus.DRAFT,
    )
    db.add(project)
    await db.flush()  # assigns project.id before commit
    await db.refresh(project)
    return project


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Extract acceptance criteria from the brief using Claude
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{project_id}/parse-criteria", response_model=ParsedCriteriaOut)
async def parse_criteria(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Call Claude to extract structured acceptance criteria from the project brief.
    Vague terms are flagged for human review.
    Criteria are stored but NOT yet approved.
    """
    project = await _get_project_or_404(project_id, db)

    try:
        parsed = parse_brief_to_criteria(
            brief=project.brief,
            agreement_text="",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Delete old criteria (new parse creates a new version)
    old = await db.execute(
        select(AcceptanceCriterion).where(AcceptanceCriterion.project_id == project.id)
    )
    for old_c in old.scalars().all():
        await db.delete(old_c)

    new_version = (project.agreement_version or 0) + 1
    project.agreement_version = new_version
    project.client_approved_criteria = False
    project.freelancer_approved_criteria = False

    # Store parsed criteria
    for c in parsed.get("criteria", []):
        criterion = AcceptanceCriterion(
            project_id=project.id,
            stable_id=c["stable_id"],
            description=c["description"],
            measurable_test=c.get("measurable_test", ""),
            required_evidence_type=c.get("required_evidence_type", "other"),
            severity=CriteriaSeverity(c.get("severity", "major")),
            automated_verifiable=c.get("automated_verifiable", False),
            agreement_version=new_version,
        )
        db.add(criterion)

    await db.commit()
    await db.refresh(project)

    return {
        "project_id": str(project.id),
        "agreement_version": new_version,
        "criteria": parsed.get("criteria", []),
        "vague_terms_found": parsed.get("vague_terms_found", []),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Client approves criteria
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{project_id}/approve-criteria/client")
async def client_approve_criteria(
    project_id: str,
    payload: CriteriaApprovalIn,
    db: AsyncSession = Depends(get_db),
):
    """
    Client approves the criteria for agreement_version.
    Payment is blocked until BOTH client and freelancer approve the SAME version.
    """
    project = await _get_project_or_404(project_id, db)
    _check_version_match(project, payload.agreement_version)
    project.client_approved_criteria = True
    await db.commit()
    await db.refresh(project)
    return {"message": "Client approval recorded.", "both_approved": _both_approved(project)}


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Freelancer approves criteria
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{project_id}/approve-criteria/freelancer")
async def freelancer_approve_criteria(
    project_id: str,
    payload: CriteriaApprovalIn,
    db: AsyncSession = Depends(get_db),
):
    """
    Freelancer approves the criteria.
    When both approve, status moves to ACTIVE and verification can begin.
    """
    project = await _get_project_or_404(project_id, db)
    _check_version_match(project, payload.agreement_version)
    project.freelancer_approved_criteria = True

    if _both_approved(project):
        project.status = ProjectStatus.ACTIVE
        # Hash the agreement for tamper-evidence
        agreement_text = f"{project_id}-v{project.agreement_version}"
        project.agreement_hash = hashlib.sha256(agreement_text.encode()).hexdigest()

    await db.commit()
    await db.refresh(project)

    return {
        "message": "Freelancer approval recorded.",
        "both_approved": _both_approved(project),
        "project_status": project.status,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Get project details
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return project details including current criteria and approval status."""
    return await _get_project_or_404(project_id, db)


# ─────────────────────────────────────────────────────────────────────────────
# Section 6: Helper utilities
# ─────────────────────────────────────────────────────────────────────────────
async def _get_project_or_404(project_id: str, db: AsyncSession) -> Project:
    try:
        val_id = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Invalid project ID format")
    result = await db.execute(select(Project).where(Project.id == val_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _check_version_match(project: Project, version: int) -> None:
    if project.agreement_version != version:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Version mismatch. Current version is {project.agreement_version}, "
                f"you submitted {version}. Re-fetch criteria before approving."
            ),
        )


def _both_approved(project: Project) -> bool:
    return project.client_approved_criteria and project.freelancer_approved_criteria
