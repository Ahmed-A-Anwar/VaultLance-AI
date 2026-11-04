"""
VaultPay – Tests: Deterministic Checks
========================================
"""

import json
from pathlib import Path
import pytest
from app.services.deterministic_checks import (
    check_file_exists,
    check_file_count,
    check_hash_match,
    check_json_valid,
    check_required_keys,
)


@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: file_exists
# ─────────────────────────────────────────────────────────────────────────────
def test_file_exists_pass(tmp_dir):
    (tmp_dir / "README.md").write_text("# Project")
    result = check_file_exists(tmp_dir, "README.md")
    assert result["passed"] is True
    assert result["verification_method"] == "deterministic"


def test_file_exists_fail(tmp_dir):
    result = check_file_exists(tmp_dir, "missing.txt")
    assert result["passed"] is False


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: json_valid
# ─────────────────────────────────────────────────────────────────────────────
def test_json_valid_pass(tmp_dir):
    f = tmp_dir / "data.json"
    f.write_text(json.dumps({"key": "value"}))
    assert check_json_valid(f)["passed"] is True


def test_json_valid_fail(tmp_dir):
    f = tmp_dir / "broken.json"
    f.write_text("{not valid json")
    assert check_json_valid(f)["passed"] is False


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: required_keys
# ─────────────────────────────────────────────────────────────────────────────
def test_required_keys_pass(tmp_dir):
    f = tmp_dir / "data.json"
    f.write_text(json.dumps({"name": "x", "version": "1.0"}))
    assert check_required_keys(f, ["name", "version"])["passed"] is True


def test_required_keys_missing(tmp_dir):
    f = tmp_dir / "data.json"
    f.write_text(json.dumps({"name": "x"}))
    result = check_required_keys(f, ["name", "version"])
    assert result["passed"] is False
    assert "version" in result["detail"]
