from __future__ import annotations

import json
import re
import subprocess
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://harvard-ats-resume.vercel.app"
EXPECTED_SHA = "04b238e2c39c2866cddef8361492fb10ca7fb96c"
HISTORICAL_COMMIT = "a9fc9c83d65e01b2d318dea804ba17b3afce9acc"
HISTORICAL_PATH = "tests/e2e/production-certification.mjs"
OUTPUT = Path("artifacts/b9-auth-preflight")


def fail(code: str, detail: str = "") -> None:
    raise RuntimeError(code if not detail else f"{code}: {detail}")


def historical_ai_fixture() -> tuple[str, str]:
    subprocess.run(
        ["git", "fetch", "--quiet", "--depth=1", "origin", HISTORICAL_COMMIT],
        check=True,
    )
    text = subprocess.check_output(
        ["git", "show", f"{HISTORICAL_COMMIT}:{HISTORICAL_PATH}"],
        text=True,
    )
    email_match = re.search(r"^const AI_EMAIL = '([^']+)';$", text, re.MULTILINE)
    password_match = re.search(r"^const AI_PASSWORD = '([^']+)';$", text, re.MULTILINE)
    if not email_match or not password_match:
        fail("B9_PREFLIGHT_HISTORICAL_FIXTURE_NOT_FOUND")
    email = email_match.group(1)
    password = password_match.group(1)
    if "4cfc422" not in email or "4cfc422" not in password:
        fail("B9_PREFLIGHT_FIXTURE_PROVENANCE_MISMATCH")
    return email, password


def runtime_identity() -> dict[str, object]:
    request = urllib.request.Request(
        f"{BASE}/api/build-info",
        headers={"User-Agent": "cvengine-b9-auth-preflight"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("gitCommitSha") != EXPECTED_SHA or payload.get("environment") != "production":
        fail("B9_PREFLIGHT_RUNTIME_MISMATCH", json.dumps(payload, sort_keys=True))
    return payload


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    runtime = runtime_identity()
    email, password = historical_ai_fixture()
    report: dict[str, object] = {
        "schemaVersion": "b9-legacy-fixture-auth-preflight-v1",
        "expectedGitCommitSha": EXPECTED_SHA,
        "observedRuntime": runtime,
        "historicalFixtureCommit": HISTORICAL_COMMIT,
        "status": "FAIL",
        "checks": [],
    }

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()
            try:
                page.goto(BASE, wait_until="networkidle", timeout=60_000)
                page.get_by_label(
                    "I understand this disclosure and will review career/application content before using it."
                ).check()
                page.get_by_role("button", name="Acknowledge and continue").click()
                page.get_by_role("heading", name="Sign in", exact=True).wait_for(timeout=30_000)
                page.get_by_label("Email", exact=True).fill(email)
                page.get_by_label("Password", exact=True).fill(password)
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.get_by_role("heading", name="Choose how CV Engine may use AI").wait_for(timeout=30_000)
                session = context.request.get(f"{BASE}/api/session", timeout=15_000)
                if session.status != 200:
                    fail("B9_PREFLIGHT_SESSION_NOT_AUTHENTICATED", str(session.status))
                report["checks"] = ["EXACT_RUNTIME", "HISTORICAL_FIXTURE_LOGIN", "SSR_SESSION_AUTHENTICATED"]
                report["status"] = "PASS"
            finally:
                context.close()
                browser.close()
    finally:
        (OUTPUT / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    print("B9_LEGACY_FIXTURE_AUTH_PREFLIGHT=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
