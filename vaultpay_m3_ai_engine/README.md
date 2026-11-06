# VaultPay – Milestone 3 (M3)
## AI Evidence Extraction, Contract Parsing & Verification Engine

**Milestone Owner:** Mohamed Emad  
**Specification:** M3 Implementation Guide  

---

### 1. Milestone Overview
This package contains the core AI verification engine for VaultPay. It turns freelance contract requirements and submitted deliverables into an explainable, source-grounded verification report without human-in-the-loop vulnerabilities.

---

### 2. Architecture & File Structure

```text
vaultpay_m3_ai_engine/
├── app/
│   ├── api/routes/
│   │   ├── projects.py           # Brief intake, criteria generation & mutual approval
│   │   ├── files.py              # Secure deliverable upload & extraction
│   │   ├── verification.py       # AI verification execution & full audit report
│   │   └── paypal.py             # Human-only PayPal escrow release
│   ├── core/
│   │   └── config.py             # App settings, thresholds & model configurations
│   ├── db/
│   │   └── base.py               # Async SQLAlchemy engine & session factory
│   ├── models/
│   │   ├── project.py            # Project & AcceptanceCriterion schemas
│   │   ├── uploaded_file.py      # Deliverable provenance metadata schema
│   │   ├── evidence_chunk.py     # Source-indexed chunk schema (line/page)
│   │   ├── verification_run.py   # VerificationRun & CriterionResult schemas
│   │   └── paypal_order.py       # PayPal escrow order (human-release guard)
│   ├── services/
│   │   ├── criteria_parser.py     # LLM (Claude) prompt-locked criteria extraction
│   │   ├── verdict_generator.py   # Evidence grounding & explainable AI verdicts
│   │   ├── deterministic_checks.py# Code AST syntax, symbol checks & live web prober
│   │   ├── file_extractor.py      # Safe ZIP bomb guard, PDF/DOCX/OCR extraction
│   │   ├── evidence_indexer.py    # Hybrid Elasticsearch indexing + DB fallback
│   │   └── paypal_service.py      # PayPal sandbox escrow capture
│   └── main.py                   # FastAPI backend entry point
├── tests/
│   ├── test_file_extractor.py     # Synthetic test vaults (ZIP bombs, corrupt files)
│   └── test_deterministic_checks.py # Unit tests for code & hash verifiers
├── test_ai_verification.py       # Complete 5-stage automated AI verification test runner
├── requirements.txt              # Production & dev dependencies
└── .env.example                  # Environment template
```

---

### 3. Step-by-Step Implementation of M3 Guide

| Step | Component | Implementation Details |
| :--- | :--- | :--- |
| **Step 1: Supported File Types** | `app/services/file_extractor.py` | PDF, DOCX, TXT, code text, images (OCR), ZIP containers. Unsupported binaries return metadata-only. |
| **Step 2: Safe Ingestion Pipeline** | `app/services/file_extractor.py` | Validates ZIP bomb compression ratios, entry count, path traversal (`..`), symlinks, and deletes temp directories. |
| **Step 3: Text Provenance** | `app/models/evidence_chunk.py` | Stores chunk ID, file ID, original filename, line numbers, page numbers, and OCR reliability flags. |
| **Step 4: Acceptance Criteria Parser** | `app/services/criteria_parser.py` | Strict JSON schema extraction; identifies and flags vague terms (`vague_flag=true`) instead of guessing. |
| **Step 5: Mutual Human Approval** | `app/api/routes/projects.py` | Both Client and Freelancer must confirm the same version before verification or payment. |
| **Step 6: Evidence Retrieval** | `app/services/evidence_indexer.py` | Hybrid keyword search scoped strictly to `project_id`. Zero leakage between contracts. |
| **Step 7: Deterministic Checks** | `app/services/deterministic_checks.py` | Code syntax (AST), symbol checking, HTML structure, and live URL HTTP/SSL runtime prober. |
| **Step 8: Structured Verdicts** | `app/services/verdict_generator.py` | Outputs `PASS`, `PARTIAL`, `FAIL`, or `NEEDS_REVIEW` with exact file/line citations and confidence estimates. |
| **Step 9: Prompt Injection Defense** | `app/services/verdict_generator.py` | Deliverables treated as untrusted data; LLM has zero execution tools or permission to move funds. |
| **Step 10: Run History & Reporting** | `app/models/verification_run.py` | Reproducible logs recording model version, prompt version, extractor version, and citations. |
| **Step 11: Evaluation Test Suite** | `test_ai_verification.py` | Full test suite verifying code checking, negative detection, and live website runtime testing. |

---

### 4. Running the Automated AI Verification Test

To verify all components locally:

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the 5-stage verification test
python test_ai_verification.py
```

### 5. Running the Backend Server

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

## PayPal router is disabled

PayPal calls are owned by the Express service (`backend/`). This engine's
`app/api/routes/paypal.py` is kept for reference but is **not registered** in
`app/main.py`, so this service cannot create an order, capture, void or pay out.
The engine is internal and stateless about money; see `docs/architecture.md`.
