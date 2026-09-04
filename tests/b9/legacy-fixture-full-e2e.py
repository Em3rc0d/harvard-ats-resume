from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

EXPECTED_SHA = "04b238e2c39c2866cddef8361492fb10ca7fb96c"
HISTORICAL_COMMIT = "a9fc9c83d65e01b2d318dea804ba17b3afce9acc"
HISTORICAL_PATH = "tests/e2e/production-certification.mjs"
SOURCE_HARNESS = Path("tests/b9/production-browser-e2e.py")
PATCHED_HARNESS = Path("/tmp/cvengine-b9-legacy-fixture-e2e.py")


def fail(code: str) -> None:
    raise RuntimeError(code)


def fixture() -> tuple[str, str]:
    subprocess.run(["git", "fetch", "--quiet", "--depth=1", "origin", HISTORICAL_COMMIT], check=True)
    historical = subprocess.check_output(
        ["git", "show", f"{HISTORICAL_COMMIT}:{HISTORICAL_PATH}"],
        text=True,
    )
    email_match = re.search(r"^const AI_EMAIL = '([^']+)';$", historical, re.MULTILINE)
    password_match = re.search(r"^const AI_PASSWORD = '([^']+)';$", historical, re.MULTILINE)
    if not email_match or not password_match:
        fail("B9_ONE_SHOT_HISTORICAL_FIXTURE_NOT_FOUND")
    email = email_match.group(1)
    password = password_match.group(1)
    if "4cfc422" not in email or "4cfc422" not in password:
        fail("B9_ONE_SHOT_FIXTURE_PROVENANCE_MISMATCH")
    return email, password


def patched_harness(email: str, password: str) -> str:
    text = SOURCE_HARNESS.read_text(encoding="utf-8")

    email_pattern = r'^SYNTHETIC_EMAIL = f"cvengine-b9-\{RUN_ID\}-\{RUN_ATTEMPT\}@example\.com"$'
    password_pattern = r'^SYNTHETIC_PASSWORD = f"B9-Cert-\{RUN_ID\}-\{RUN_ATTEMPT\}-A1!"$'
    text, email_count = re.subn(email_pattern, f"SYNTHETIC_EMAIL = {email!r}", text, flags=re.MULTILINE)
    text, password_count = re.subn(password_pattern, f"SYNTHETIC_PASSWORD = {password!r}", text, flags=re.MULTILINE)
    if email_count != 1 or password_count != 1:
        fail("B9_ONE_SHOT_FIXTURE_CONSTANT_PATCH_MISMATCH")

    signup = '''            page.get_by_role("button", name="Create an account").click()\n            page.get_by_label("Email", exact=True).fill(SYNTHETIC_EMAIL)\n            page.get_by_label("Password", exact=True).fill(SYNTHETIC_PASSWORD)\n            page.get_by_role("button", name="Create account", exact=True).click()'''
    signin = '''            page.get_by_role("heading", name="Sign in", exact=True).wait_for(timeout=30_000)\n            page.get_by_label("Email", exact=True).fill(SYNTHETIC_EMAIL)\n            page.get_by_label("Password", exact=True).fill(SYNTHETIC_PASSWORD)\n            page.get_by_role("button", name="Sign in", exact=True).click()'''
    if text.count(signup) != 1:
        fail("B9_ONE_SHOT_AUTH_BLOCK_PATCH_MISMATCH")
    text = text.replace(signup, signin)
    return text


def main() -> int:
    email, password = fixture()
    PATCHED_HARNESS.write_text(patched_harness(email, password), encoding="utf-8")
    env = os.environ.copy()
    env["CVENGINE_EXPECTED_SHA"] = EXPECTED_SHA
    env["CVENGINE_BASE_URL"] = "https://harvard-ats-resume.vercel.app"
    env["CVENGINE_E2E_OUTPUT_DIR"] = "artifacts/b9-production-browser"
    completed = subprocess.run([sys.executable, str(PATCHED_HARNESS)], env=env, check=False)
    if completed.returncode != 0:
        return completed.returncode
    print("CVENGINE_B9_ONE_SHOT_PRODUCTION_BROWSER_E2E=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
