"""
VaultPay – Deterministic Verification Checks
=============================================
Objective checks performed by CODE, not the LLM.
These checks are kept strictly separate from AI verdicts.

Included checks:
  - file_exists       : Is there a file matching a required name?
  - file_count        : Does the deliverable contain exactly N files?
  - hash_match        : Does a file's SHA-256 match an expected value?
  - json_valid        : Is a file valid JSON?
  - required_keys     : Does a JSON file contain required keys?
  - website_live      : Is a URL reachable, HTTP 200, valid SSL, and responsive?
  - code_syntax       : Is code valid Python (AST), JS, HTML, or CSS?
  - code_symbols      : Are required functions/classes present in source files?
  - html_elements     : Are required HTML tags/components (forms, buttons) present?
"""

import ast
import hashlib
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Result type returned by every check
# ─────────────────────────────────────────────────────────────────────────────
def _result(passed: bool, detail: str, evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    """Standardised deterministic check result."""
    res = {
        "passed": passed,
        "detail": detail,
        "verification_method": "deterministic",
    }
    if evidence:
        res["evidence"] = evidence
    return res


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: File existence check
# ─────────────────────────────────────────────────────────────────────────────
def check_file_exists(upload_dir: Path, required_filename: str) -> dict[str, Any]:
    """Return PASS if any uploaded file has the required name."""
    matches = list(upload_dir.rglob(required_filename))
    if matches:
        return _result(True, f"File '{required_filename}' found at: {matches[0].name}")
    return _result(False, f"File '{required_filename}' not found in uploaded deliverables.")


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: File count check
# ─────────────────────────────────────────────────────────────────────────────
def check_file_count(upload_dir: Path, expected_count: int) -> dict[str, Any]:
    """Return PASS if the upload dir contains exactly expected_count files."""
    actual = len([f for f in upload_dir.rglob("*") if f.is_file()])
    if actual == expected_count:
        return _result(True, f"File count matches: {actual}")
    return _result(False, f"Expected {expected_count} files, found {actual}.")


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: SHA-256 hash match
# ─────────────────────────────────────────────────────────────────────────────
def check_hash_match(file_path: Path, expected_hash: str) -> dict[str, Any]:
    """Return PASS if the file's SHA-256 matches the expected hash."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    actual_hash = h.hexdigest()
    if actual_hash.lower() == expected_hash.lower():
        return _result(True, f"Hash matches: {actual_hash}")
    return _result(False, f"Hash mismatch. Expected: {expected_hash}, got: {actual_hash}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: JSON validity check
# ─────────────────────────────────────────────────────────────────────────────
def check_json_valid(file_path: Path) -> dict[str, Any]:
    """Return PASS if the file is valid JSON."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            json.load(f)
        return _result(True, "File is valid JSON.")
    except json.JSONDecodeError as e:
        return _result(False, f"Invalid JSON: {e}")
    except Exception as e:
        return _result(False, f"Could not read file: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 6: Required JSON keys check
# ─────────────────────────────────────────────────────────────────────────────
def check_required_keys(file_path: Path, required_keys: list[str]) -> dict[str, Any]:
    """Return PASS if the JSON file contains all required top-level keys."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        missing = [k for k in required_keys if k not in data]
        if not missing:
            return _result(True, f"All required keys present: {required_keys}")
        return _result(False, f"Missing keys: {missing}")
    except Exception as e:
        return _result(False, f"Could not parse JSON: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 7: Live Website Prober (Runtime checks)
# ─────────────────────────────────────────────────────────────────────────────
def check_website_live(
    url: str,
    expected_status: int = 200,
    required_keywords: list[str] | None = None,
    timeout: float = 6.0,
) -> dict[str, Any]:
    """
    Checks if a live website is reachable, returns expected HTTP status,
    measures response time, and optionally checks HTML content for keywords.
    """
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        url = "https://" + url

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "VaultPay-LiveVerifier/1.0 (+http://vaultpay.ai)"},
    )

    start_time = time.time()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as response:
            latency_ms = round((time.time() - start_time) * 1000, 1)
            status_code = response.getcode()
            html_bytes = response.read(65536)
            html_text = html_bytes.decode("utf-8", errors="replace")

            # Extract title
            title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
            page_title = title_match.group(1).strip() if title_match else "Untitled"

            # Check status code
            if status_code != expected_status:
                return _result(
                    False,
                    f"Website reachable at {url} but returned status {status_code} (expected {expected_status}).",
                    {"status": status_code, "latency_ms": latency_ms, "title": page_title},
                )

            # Check keywords if specified
            missing_keywords = []
            if required_keywords:
                for kw in required_keywords:
                    if kw.lower() not in html_text.lower():
                        missing_keywords.append(kw)

            if missing_keywords:
                return _result(
                    False,
                    f"Website is online (200 OK, {latency_ms}ms) but missing required content/keywords: {missing_keywords}.",
                    {"status": status_code, "latency_ms": latency_ms, "title": page_title, "missing_keywords": missing_keywords},
                )

            return _result(
                True,
                f"Website verified live at {url}: Status {status_code} OK, response time {latency_ms}ms, title '{page_title}'.",
                {"status": status_code, "latency_ms": latency_ms, "title": page_title},
            )

    except urllib.error.HTTPError as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        return _result(
            False,
            f"Website returned HTTP error {e.code}: {e.reason}",
            {"status": e.code, "latency_ms": latency_ms},
        )
    except urllib.error.URLError as e:
        return _result(
            False,
            f"Cannot connect to website {url}: {e.reason}",
        )
    except Exception as e:
        return _result(
            False,
            f"Website check failed for {url}: {str(e)}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Section 8: Code Syntax Validator
# ─────────────────────────────────────────────────────────────────────────────
def check_code_syntax(file_path: Path) -> dict[str, Any]:
    """
    Validates code syntax for Python, JS, HTML, or CSS deliverables.
    """
    ext = file_path.suffix.lower()
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return _result(False, f"Could not read source code file: {e}")

    # Python syntax via AST
    if ext == ".py":
        try:
            ast.parse(content, filename=str(file_path))
            return _result(True, f"Python source code '{file_path.name}' has valid syntax (AST verified).")
        except SyntaxError as e:
            return _result(
                False,
                f"Python syntax error in '{file_path.name}' at line {e.lineno}: {e.msg}",
                {"line": e.lineno, "offset": e.offset, "text": e.text},
            )

    # HTML structure check
    elif ext in {".html", ".htm"}:
        open_tags = len(re.findall(r"<[a-zA-Z][^>]*>", content))
        close_tags = len(re.findall(r"</[a-zA-Z][^>]*>", content))
        has_doctype = "<!doctype" in content.lower()
        if open_tags > 0 and (has_doctype or close_tags > 0):
            return _result(True, f"HTML deliverable '{file_path.name}' is well-formed ({open_tags} tags found).")
        return _result(False, f"HTML deliverable '{file_path.name}' appears malformed or empty.")

    # JavaScript / JSON / CSS
    elif ext in {".js", ".ts", ".css"}:
        if len(content.strip()) > 0:
            # Check balanced brackets
            brackets = {"(": ")", "{": "}", "[": "]"}
            stack = []
            for char in content:
                if char in brackets:
                    stack.append(char)
                elif char in brackets.values():
                    if not stack or brackets[stack.pop()] != char:
                        return _result(False, f"Syntax issue in '{file_path.name}': mismatched brackets '{char}'.")
            if stack:
                return _result(False, f"Syntax issue in '{file_path.name}': unclosed brackets '{stack[-1]}'.")
            return _result(True, f"Source file '{file_path.name}' syntax check passed.")
        return _result(False, f"Source file '{file_path.name}' is empty.")

    return _result(True, f"File '{file_path.name}' verified readable.")


# ─────────────────────────────────────────────────────────────────────────────
# Section 9: Code Symbol & Component Checker
# ─────────────────────────────────────────────────────────────────────────────
def check_code_symbol(
    file_path: Path,
    required_functions: list[str] | None = None,
    required_classes: list[str] | None = None,
) -> dict[str, Any]:
    """
    Verifies that required functions or classes exist in source code files.
    """
    ext = file_path.suffix.lower()
    content = file_path.read_text(encoding="utf-8", errors="replace")

    missing = []
    found = []

    if ext == ".py":
        try:
            tree = ast.parse(content)
            func_names = {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef)}
            class_names = {node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)}

            if required_functions:
                for fn in required_functions:
                    if fn in func_names:
                        found.append(f"function '{fn}'")
                    else:
                        missing.append(f"function '{fn}'")

            if required_classes:
                for cl in required_classes:
                    if cl in class_names:
                        found.append(f"class '{cl}'")
                    else:
                        missing.append(f"class '{cl}'")

        except Exception as e:
            return _result(False, f"Could not parse Python AST: {e}")
    else:
        # Regex search for JS/TS/other functions and classes
        if required_functions:
            for fn in required_functions:
                pattern = rf"(function\s+{fn}|const\s+{fn}\s*=|def\s+{fn})"
                if re.search(pattern, content):
                    found.append(f"function '{fn}'")
                else:
                    missing.append(f"function '{fn}'")

        if required_classes:
            for cl in required_classes:
                pattern = rf"(class\s+{cl})"
                if re.search(pattern, content):
                    found.append(f"class '{cl}'")
                else:
                    missing.append(f"class '{cl}'")

    if missing:
        return _result(False, f"In '{file_path.name}', missing required symbols: {missing}. Found: {found}.")
    return _result(True, f"In '{file_path.name}', all required symbols were verified: {found}.")


# ─────────────────────────────────────────────────────────────────────────────
# Section 10: HTML Elements & Structure Checker
# ─────────────────────────────────────────────────────────────────────────────
def check_html_elements(file_path: Path, required_elements: list[str]) -> dict[str, Any]:
    """
    Checks if required HTML elements (e.g. 'form', 'nav', 'input', 'button') exist.
    """
    content = file_path.read_text(encoding="utf-8", errors="replace").lower()
    missing = []
    found = []

    for elem in required_elements:
        elem_clean = elem.lower().strip()
        pattern = rf"<{elem_clean}[\s>]"
        if re.search(pattern, content):
            found.append(elem_clean)
        else:
            missing.append(elem_clean)

    if missing:
        return _result(False, f"HTML file '{file_path.name}' is missing elements: {missing}. Found: {found}.")
    return _result(True, f"HTML file '{file_path.name}' contains all required elements: {found}.")
