from __future__ import annotations

import json
import os
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = "https://harvard-ats-resume.vercel.app"
EXPECTED_SHA = os.environ["CVENGINE_EXPECTED_SHA"]
EMAIL = os.environ["CVENGINE_DIAGNOSTIC_EMAIL"]
PASSWORD = os.environ["CVENGINE_DIAGNOSTIC_PASSWORD"]
OUTPUT = Path("artifacts/b9-provider-diagnostic")


def safe_json(response):
    try:
        return response.json()
    except Exception:
        return None


def sanitized_attempts(payload):
    attempts = payload.get("attempts") if isinstance(payload, dict) else None
    if not isinstance(attempts, list):
        return []
    safe_keys = (
        "provider",
        "model",
        "status",
        "failureCode",
        "durationMs",
        "inputTokens",
        "outputTokens",
    )
    return [
        {key: item.get(key) for key in safe_keys if key in item}
        for item in attempts
        if isinstance(item, dict)
    ]


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {
        "schemaVersion": "b9-provider-diagnostic-v1",
        "expectedGitCommitSha": EXPECTED_SHA,
        "status": "FAIL",
    }
    session_authenticated = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            runtime = context.request.get(f"{BASE_URL}/api/build-info", timeout=20_000)
            runtime_payload = safe_json(runtime) or {}
            report["observedGitCommitSha"] = runtime_payload.get("gitCommitSha")
            report["observedEnvironment"] = runtime_payload.get("environment")
            if runtime.status != 200 or runtime_payload.get("gitCommitSha") != EXPECTED_SHA:
                raise RuntimeError("DIAGNOSTIC_EXACT_RUNTIME_MISMATCH")

            page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
            page.get_by_label(
                "I understand this disclosure and will review career/application content before using it."
            ).check()
            page.get_by_role("button", name="Acknowledge and continue").click()
            page.get_by_role("heading", name="Sign in").wait_for(timeout=30_000)
            page.get_by_label("Email", exact=True).fill(EMAIL)
            page.get_by_label("Password", exact=True).fill(PASSWORD)
            page.get_by_role("button", name="Sign in", exact=True).click()

            deadline = time.monotonic() + 20
            session = None
            while time.monotonic() < deadline:
                session = context.request.get(f"{BASE_URL}/api/session", timeout=10_000)
                if session.status == 200:
                    session_authenticated = True
                    break
                time.sleep(0.5)
            if not session_authenticated:
                status = session.status if session is not None else "none"
                raise RuntimeError(f"DIAGNOSTIC_SESSION_NOT_AUTHENTICATED:{status}")

            consent = context.request.post(
                f"{BASE_URL}/api/consent",
                data={"aiAccessModePreference": "PLATFORM_GEMINI"},
                timeout=15_000,
            )
            if consent.status != 201:
                raise RuntimeError(f"DIAGNOSTIC_PLATFORM_CONSENT_FAILED:{consent.status}")

            evidence_response = context.request.get(f"{BASE_URL}/api/career/evidence", timeout=20_000)
            evidence_payload = safe_json(evidence_response) or {}
            evidence = evidence_payload.get("evidence") if isinstance(evidence_payload, dict) else None
            verified = [item for item in (evidence or []) if item.get("verificationStatus") == "VERIFIED"]
            if not verified:
                raise RuntimeError("DIAGNOSTIC_NO_EXISTING_VERIFIED_SYNTHETIC_EVIDENCE")
            selected = verified[0]
            evidence_id = selected["id"]
            report["selectedEvidenceKind"] = selected.get("kind")
            report["selectedEvidenceRevision"] = selected.get("revision")

            started = time.monotonic()
            proposal = context.request.post(
                f"{BASE_URL}/api/presentation/evidence/{evidence_id}/proposals",
                data={},
                timeout=45_000,
            )
            report["proposalElapsedMs"] = round((time.monotonic() - started) * 1000)
            payload = safe_json(proposal) or {}
            report["proposalHttpStatus"] = proposal.status
            report["proposalError"] = payload.get("error")
            report["failureCode"] = payload.get("failureCode")
            report["attempts"] = sanitized_attempts(payload)
            report["hasRequestId"] = bool(payload.get("requestId"))
            report["outcome"] = (
                "CREATED" if proposal.status == 201 else
                "VALIDATOR_REJECTED" if proposal.status == 422 else
                "PROVIDER_FAILURE" if proposal.status in (429, 503) else
                "OTHER"
            )

            revision = payload.get("revision") if isinstance(payload, dict) else None
            if proposal.status == 201 and isinstance(revision, dict) and revision.get("id"):
                resolution = context.request.patch(
                    f"{BASE_URL}/api/presentation/revisions/{revision['id']}",
                    data={"decision": "REJECT"},
                    timeout=15_000,
                )
                report["diagnosticProposalRejected"] = resolution.status == 200

            report["status"] = "PASS"
            print(json.dumps({
                "proposalHttpStatus": report.get("proposalHttpStatus"),
                "proposalError": report.get("proposalError"),
                "failureCode": report.get("failureCode"),
                "attempts": report.get("attempts"),
                "proposalElapsedMs": report.get("proposalElapsedMs"),
                "outcome": report.get("outcome"),
            }, sort_keys=True))
            return 0
        except Exception as exc:
            report["error"] = str(exc)
            return 1
        finally:
            if session_authenticated:
                try:
                    restore = context.request.post(
                        f"{BASE_URL}/api/consent",
                        data={"aiAccessModePreference": "NO_CLOUD_AI"},
                        timeout=15_000,
                    )
                    report["consentRestoredToNoCloud"] = restore.status == 201
                except Exception:
                    report["consentRestoredToNoCloud"] = False
            else:
                report["consentRestoredToNoCloud"] = None
            (OUTPUT / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
            context.close()
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
