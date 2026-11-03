"""
VaultPay – FastAPI Route: Verification Runs
============================================
Handles:
  - Triggering a verification run for a project
  - Running deterministic checks + AI verdicts per criterion
  - Returning the full structured report with evidence references
  - Run history

Security:
  - Criteria must be mutually approved before a run can start
  - The AI cannot authorize payment from this endpoint
"""

from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.project import Project, AcceptanceCriterion, ProjectStatus
from app.models.verification_run import VerificationRun, CriterionResult, RunStatus, Verdict, VerificationMethod
from app.services.verdict_generator import generate_criterion_verdict, compute_overall_verdict
from app.core.config import get_settings

router = APIRouter(prefix="/projects/{project_id}/runs", tags=["Verification"])
settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Start a verification run
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/", status_code=201)
async def start_verification_run(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a verification run.
    - Requires both client and freelancer to have approved criteria.
    - Runs deterministic checks + AI verdict per criterion.
    - Overall verdict is PASS only if all CRITICAL criteria pass.
    - The AI CANNOT authorize payment – that is a separate human-triggered step.
    """
    # ── Validate project & approval status ───────────────────────────────
    try:
        val_id = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Invalid project ID format")

    result = await db.execute(select(Project).where(Project.id == val_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not (project.client_approved_criteria and project.freelancer_approved_criteria):
        raise HTTPException(
            status_code=403,
            detail="Both client and freelancer must approve the criteria before verification.",
        )

    # ── Create VerificationRun record ────────────────────────────────────
    run = VerificationRun(
        project_id=val_id,
        status=RunStatus.VERIFYING,
        model_name=settings.claude_model,
        model_version="1",
        prompt_version=settings.prompt_version,
        extractor_version=settings.extractor_version,
    )
    db.add(run)
    project.status = ProjectStatus.IN_VERIFICATION
    await db.flush()

    # ── Load acceptance criteria ─────────────────────────────────────────
    crit_result = await db.execute(
        select(AcceptanceCriterion).where(AcceptanceCriterion.project_id == val_id)
    )
    criteria = crit_result.scalars().all()

    if not criteria:
        raise HTTPException(status_code=422, detail="No acceptance criteria found for this project.")

    # ── Generate a verdict for each criterion ────────────────────────────
    all_results: list[dict] = []

    for criterion in criteria:
        criterion_dict = {
            "stable_id": criterion.stable_id,
            "description": criterion.description,
            "measurable_test": criterion.measurable_test,
            "required_evidence_type": criterion.required_evidence_type,
            "severity": criterion.severity.value,
            "automated_verifiable": criterion.automated_verifiable,
        }

        # Get AI verdict
        verdict_data = await generate_criterion_verdict(
            project_id=project_id,
            criterion=criterion_dict,
            model_name=settings.claude_model,
        )

        # Normalize verification method and verdict
        method_raw = verdict_data.get("verification_method", VerificationMethod.AI)
        if isinstance(method_raw, str):
            try:
                method = VerificationMethod(method_raw.lower())
            except ValueError:
                method = VerificationMethod.AI
        else:
            method = method_raw

        verdict_val = verdict_data["verdict"]
        if hasattr(verdict_val, "value"):
            verdict_enum = verdict_val
        else:
            verdict_enum = Verdict(str(verdict_val))

        # Store CriterionResult in DB
        cr = CriterionResult(
            run_id=run.id,
            criterion_id=criterion.id,
            verdict=verdict_enum,
            explanation=verdict_data.get("explanation", ""),
            cited_evidence=verdict_data.get("cited_evidence", []),
            missing_evidence=verdict_data.get("missing_evidence"),
            confidence_estimate=verdict_data.get("confidence_estimate"),
            verification_method=method,
            limitations=verdict_data.get("limitations"),
        )
        db.add(cr)

        all_results.append({
            **verdict_data,
            "verdict": verdict_enum.value,
            "verification_method": method.value,
            "stable_id": criterion.stable_id,
        })

    # ── Compute overall verdict ──────────────────────────────────────────
    criteria_dicts = [
        {"stable_id": c.stable_id, "severity": c.severity.value} for c in criteria
    ]
    overall = compute_overall_verdict(all_results, criteria_dicts)

    run.overall_verdict = overall
    run.status = RunStatus.DONE
    run.finished_at = datetime.utcnow()

    await db.commit()
    await db.refresh(run)

    return {
        "run_id": str(run.id),
        "overall_verdict": overall.value if hasattr(overall, "value") else str(overall),
        "status": run.status.value if hasattr(run.status, "value") else str(run.status),
        "criterion_results": all_results,
        "model_name": run.model_name,
        "prompt_version": run.prompt_version,
        "finished_at": run.finished_at.isoformat(),
        "note": (
            "AI verdict is advisory only. "
            "Payment release requires explicit human approval via POST /paypal/orders/{order_id}/approve."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Get verification run history for a project
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/")
async def list_runs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return all verification runs for a project, ordered by most recent first."""
    try:
        val_proj_id = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        return []

    result = await db.execute(
        select(VerificationRun)
        .where(VerificationRun.project_id == val_proj_id)
        .order_by(VerificationRun.started_at.desc())
    )
    runs = result.scalars().all()
    return [
        {
            "run_id": str(r.id),
            "overall_verdict": r.overall_verdict,
            "status": r.status,
            "model_name": r.model_name,
            "started_at": r.started_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in runs
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Get full report for a specific run
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{run_id}")
async def get_run_report(
    project_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the full verification report including all criterion verdicts and evidence references."""
    try:
        val_proj_id = uuid.UUID(str(project_id))
        val_run_id = uuid.UUID(str(run_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Invalid ID format")

    result = await db.execute(
        select(VerificationRun)
        .where(VerificationRun.id == val_run_id, VerificationRun.project_id == val_proj_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    cr_result = await db.execute(
        select(CriterionResult).where(CriterionResult.run_id == val_run_id)
    )
    criterion_results = cr_result.scalars().all()

    return {
        "run_id": str(run.id),
        "project_id": str(run.project_id),
        "overall_verdict": run.overall_verdict,
        "status": run.status,
        "model_name": run.model_name,
        "prompt_version": run.prompt_version,
        "extractor_version": run.extractor_version,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "criterion_results": [
            {
                "criterion_id": str(cr.criterion_id),
                "verdict": cr.verdict,
                "explanation": cr.explanation,
                "cited_evidence": cr.cited_evidence,
                "missing_evidence": cr.missing_evidence,
                "confidence_estimate": cr.confidence_estimate,
                "verification_method": cr.verification_method,
                "limitations": cr.limitations,
            }
            for cr in criterion_results
        ],
    }
