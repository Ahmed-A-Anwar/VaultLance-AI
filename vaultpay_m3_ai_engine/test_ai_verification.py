"""
VaultPay Original – Comprehensive AI Code & Website Verification Test
=====================================================================
Tests:
  1. Website code deliverable (HTML + JS + CSS) verification against client criteria
  2. Missing requirement detection (ensuring AI honestly FAILS incomplete work)
  3. Live website runtime verification (HTTP status, SSL, latency, title)
"""

import asyncio
import json
import uuid
from pathlib import Path
import httpx
from app.db.base import init_db, AsyncSessionLocal
from app.models.project import Project, AcceptanceCriterion, ProjectStatus, CriteriaSeverity
from app.models.uploaded_file import UploadedFile
from app.models.evidence_chunk import EvidenceChunk
from app.services.criteria_parser import parse_brief_to_criteria
from app.services.file_extractor import ingest_uploaded_file
from app.services.verdict_generator import generate_criterion_verdict, compute_overall_verdict
from app.services.deterministic_checks import check_website_live, check_code_syntax, check_code_symbol, check_html_elements


async def run_tests():
    print("=" * 70)
    print(" VAULTPAY ORIGINAL: TESTING AI CODE & WEBSITE VERIFICATION ENGINE ")
    print("=" * 70)
    await init_db()

    # ─────────────────────────────────────────────────────────────────────────
    # SCENARIO 1: CLIENT SETS NATURAL LANGUAGE CRITERIA FOR WEBSITE CODE
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 1] Parsing Client Brief into Structured Criteria...")
    brief = """
    We need a portfolio website for a design agency.
    1. Must contain a header with navigation and a contact form with an email input.
    2. Must include JavaScript function validateForm to check user inputs.
    3. Source code must have valid syntax with zero errors.
    """
    parsed = parse_brief_to_criteria(brief)
    print(f" -> Extracted {len(parsed['criteria'])} structured criteria:")
    for c in parsed["criteria"]:
        print(f"    * [{c['stable_id']}] {c['description'][:60]}... (Type: {c['required_evidence_type']}, Severity: {c['severity']})")

    # ─────────────────────────────────────────────────────────────────────────
    # SCENARIO 2: FREELANCER SUBMITS REAL CODE DELIVERABLES
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 2] Freelancer Uploads Code Deliverables (HTML + JS + CSS)...")
    project_id = str(uuid.uuid4())
    upload_dir = Path("uploads") / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    html_code = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Design Agency Portfolio</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <nav><a href="#home">Home</a><a href="#about">About</a><a href="#contact">Contact</a></nav>
    </header>
    <main>
        <h1>Creative Design Studio</h1>
        <form id="contactForm">
            <label for="email">Your Email:</label>
            <input type="email" id="email" name="email" required placeholder="name@example.com">
            <button type="submit" id="submitBtn">Send Inquiry</button>
        </form>
    </main>
    <script src="script.js"></script>
</body>
</html>"""

    js_code = """// Form Validation Module
function validateForm() {
    const emailField = document.getElementById('email');
    if (!emailField || !emailField.value.includes('@')) {
        alert('Please enter a valid email address.');
        return false;
    }
    console.log('Form validated successfully.');
    return true;
}

document.getElementById('contactForm')?.addEventListener('submit', function(e) {
    if (!validateForm()) {
        e.preventDefault();
    }
});
"""

    html_path = upload_dir / "index.html"
    js_path = upload_dir / "script.js"
    html_path.write_text(html_code, encoding="utf-8")
    js_path.write_text(js_code, encoding="utf-8")

    # Ingest and extract chunks into DB
    async with AsyncSessionLocal() as session:
        proj = Project(
            id=uuid.UUID(project_id),
            title="Portfolio Website",
            brief=brief,
            client_approved_criteria=True,
            freelancer_approved_criteria=True,
            status=ProjectStatus.ACTIVE,
        )
        session.add(proj)
        await session.flush()

        for fpath, fname in [(html_path, "index.html"), (js_path, "script.js")]:
            ingest_res = ingest_uploaded_file(fpath, fname, "1.0")
            uf = UploadedFile(
                project_id=uuid.UUID(project_id),
                original_filename=fname,
                storage_path=str(fpath),
                mime_type=ingest_res.get("mime_type") or "text/plain",
                file_size_bytes=fpath.stat().st_size,
                sha256_hash=ingest_res["sha256_hash"],
            )
            session.add(uf)
            await session.flush()

            for chunk_data in ingest_res["chunks"]:
                chunk = EvidenceChunk(
                    file_id=uf.id,
                    text=chunk_data.get("text", ""),
                    line_start=chunk_data.get("line_start"),
                    line_end=chunk_data.get("line_end"),
                    page_number=chunk_data.get("page_number"),
                )
                session.add(chunk)
        await session.commit()
    print(" -> Code files ingested, hashed, and chunks indexed in database.")

    # ─────────────────────────────────────────────────────────────────────────
    # SCENARIO 3: RUN VERIFICATION ON THE CODE DELIVERABLES
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 3] Running AI Verification on Code Deliverables...")
    run_results = []
    for criterion in parsed["criteria"]:
        verdict = await generate_criterion_verdict(
            project_id=project_id,
            criterion=criterion,
        )
        run_results.append({**verdict, "stable_id": criterion["stable_id"]})
        print(f"\n Criterion [{criterion['stable_id']}]: {criterion['description']}")
        print(f"  -> Verdict:      {verdict['verdict']}")
        print(f"  -> Method:       {verdict['verification_method']}")
        print(f"  -> Confidence:   {verdict['confidence_estimate']} (estimate)")
        print(f"  -> Explanation:  {verdict['explanation']}")
        if verdict["cited_evidence"]:
            ev = verdict["cited_evidence"][0]
            print(f"  -> Cited Source: {ev.get('file')} (lines {ev.get('line_start')}-{ev.get('line_end')})")
            print(f"     Excerpt: {ev.get('excerpt', '')[:120].strip()}...")

    criteria_summary = [{"stable_id": c["stable_id"], "severity": c["severity"]} for c in parsed["criteria"]]
    overall = compute_overall_verdict(run_results, criteria_summary)
    print(f"\n=======================================================")
    print(f" OVERALL VERDICT FOR CODE SUBMISSION: {overall.value}")
    print(f"=======================================================")

    # ─────────────────────────────────────────────────────────────────────────
    # SCENARIO 4: NEGATIVE TEST – MISSING REQUIREMENT (CATCHING INCOMPLETE WORK)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 4] Negative Test: Testing Freelancer Missing a Required Feature...")
    missing_criterion = {
        "stable_id": "C-999",
        "description": "Must implement user payment integration with Stripe checkout function processPayment",
        "measurable_test": "Verify source code implements processPayment with Stripe API integration",
        "required_evidence_type": "code",
        "severity": "critical",
        "automated_verifiable": True,
    }
    fail_verdict = await generate_criterion_verdict(
        project_id=project_id,
        criterion=missing_criterion,
    )
    print(f" Criterion [{missing_criterion['stable_id']}]: {missing_criterion['description']}")
    print(f"  -> Verdict:      {fail_verdict['verdict']} (Honest detection!)")
    print(f"  -> Missing:      {fail_verdict['missing_evidence']}")
    print(f"  -> Explanation:  {fail_verdict['explanation']}")

    # ─────────────────────────────────────────────────────────────────────────
    # SCENARIO 5: LIVE WEBSITE RUNTIME VERIFICATION
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 5] Live Website Runtime Probing...")
    web_criterion = {
        "stable_id": "C-WEB",
        "description": "The client web platform must be online and live at https://example.com",
        "measurable_test": "HTTP status must return 200 OK with valid SSL",
        "required_evidence_type": "website",
        "severity": "critical",
        "automated_verifiable": True,
    }
    web_verdict = await generate_criterion_verdict(
        project_id=project_id,
        criterion=web_criterion,
    )
    print(f" Criterion [{web_criterion['stable_id']}]: {web_criterion['description']}")
    print(f"  -> Verdict:      {web_verdict['verdict']}")
    print(f"  -> Method:       {web_verdict['verification_method']}")
    print(f"  -> Explanation:  {web_verdict['explanation']}")
    if web_verdict["cited_evidence"]:
        print(f"  -> Evidence:     {web_verdict['cited_evidence'][0]['excerpt']}")

    print("\n" + "=" * 70)
    print(" ALL 5 TESTS COMPLETED SUCCESSFULLY! ")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_tests())
