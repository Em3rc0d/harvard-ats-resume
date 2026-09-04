from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from playwright.sync_api import BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

BASE_URL = os.environ.get("CVENGINE_BASE_URL", "https://harvard-ats-resume.vercel.app").rstrip("/")
EXPECTED_SHA = os.environ.get("CVENGINE_EXPECTED_SHA", "").strip()
RUN_ID = os.environ.get("GITHUB_RUN_ID", "local")
RUN_ATTEMPT = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
OUTPUT_DIR = Path(os.environ.get("CVENGINE_E2E_OUTPUT_DIR", "artifacts/b9-production-browser"))
SOURCE_TEXT = "Built a synthetic inventory API using Java Spring Boot and PostgreSQL."
CANDIDATE_NAME = "CV Engine Synthetic Candidate"
TARGET_ROLE = "Backend Engineer"
SYNTHETIC_EMAIL = f"cvengine-b9-{RUN_ID}-{RUN_ATTEMPT}@example.com"
SYNTHETIC_PASSWORD = f"B9-Cert-{RUN_ID}-{RUN_ATTEMPT}-A1!"


def fail(code: str, detail: str | None = None) -> None:
    raise RuntimeError(code if detail is None else f"{code}: {detail}")


def get_json(url: str, timeout: float = 10.0) -> dict[str, Any] | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "cvengine-b9-certification"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def wait_for_exact_runtime() -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{40}", EXPECTED_SHA):
        fail("B9_BROWSER_EXPECTED_SHA_INVALID")
    deadline = time.monotonic() + 12 * 60
    last: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        last = get_json(f"{BASE_URL}/api/build-info")
        if last and last.get("gitCommitSha") == EXPECTED_SHA and last.get("environment") == "production":
            return last
        time.sleep(5)
    fail("B9_BROWSER_EXACT_RUNTIME_NOT_READY", json.dumps(last, sort_keys=True) if last else "no build-info response")


def write_synthetic_docx(path: Path) -> None:
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body><w:p><w:r><w:t>' + escape(SOURCE_TEXT) + '</w:t></w:r></w:p>'
        '<w:sectPr/></w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("word/document.xml", document_xml)


def download_bytes(page: Page, accessible_name: str) -> bytes:
    with page.expect_download(timeout=30_000) as download_info:
        page.get_by_role("link", name=accessible_name, exact=True).click()
    download = download_info.value
    path = download.path()
    if path is None:
        fail("B9_BROWSER_DOWNLOAD_PATH_MISSING", accessible_name)
    return Path(path).read_bytes()


def assert_docx(payload: bytes, expected_text: str) -> None:
    if payload[:4] != b"PK\x03\x04":
        fail("B9_BROWSER_DOCX_SIGNATURE_INVALID")
    temp = OUTPUT_DIR / "artifact.docx"
    temp.write_bytes(payload)
    with zipfile.ZipFile(temp) as archive:
        document = archive.read("word/document.xml").decode("utf-8")
    if CANDIDATE_NAME not in document or expected_text not in document:
        fail("B9_BROWSER_DOCX_CANONICAL_CONTENT_MISMATCH")


def assert_pdf(payload: bytes, expected_text: str) -> None:
    if not payload.startswith(b"%PDF-1.4"):
        fail("B9_BROWSER_PDF_SIGNATURE_INVALID")
    raw = payload.decode("latin1")
    if CANDIDATE_NAME not in raw or expected_text not in raw:
        fail("B9_BROWSER_PDF_CANONICAL_CONTENT_MISMATCH")
    (OUTPUT_DIR / "artifact.pdf").write_bytes(payload)


def cleanup_account(context: BrowserContext) -> None:
    try:
        context.request.delete(
            f"{BASE_URL}/api/account/delete",
            data={"confirmation": "DELETE_MY_ACCOUNT"},
            timeout=15_000,
        )
    except Exception:
        pass


def _safe_response_json(response: Any) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _safe_provider_attempts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    attempts = payload.get("attempts")
    if not isinstance(attempts, list):
        return []
    safe_keys = ("provider", "model", "status", "failureCode", "durationMs", "inputTokens", "outputTokens")
    return [
        {key: item.get(key) for key in safe_keys if key in item}
        for item in attempts
        if isinstance(item, dict)
    ]


def create_and_approve_presentation(evidence_card: Any, report: dict[str, Any]) -> str:
    page = evidence_card.page
    proposal_pattern = re.compile(r"/api/presentation/evidence/[^/]+/proposals$")
    with page.expect_response(
        lambda response: proposal_pattern.search(response.url) is not None
        and response.request.method == "POST",
        timeout=45_000,
    ) as response_info:
        evidence_card.get_by_role("button", name="Improve wording").click()

    response = response_info.value
    payload = _safe_response_json(response)
    report["presentationProposalHttpStatus"] = response.status
    report["presentationProposalFailureCode"] = payload.get("failureCode")
    report["presentationProviderAttempts"] = _safe_provider_attempts(payload)

    if response.status in (429, 503):
        fail(
            "B9_BROWSER_AI_ASSIST_UNAVAILABLE",
            json.dumps(
                {
                    "status": response.status,
                    "failureCode": payload.get("failureCode"),
                    "attempts": report["presentationProviderAttempts"],
                },
                sort_keys=True,
            ),
        )
    if response.status == 422:
        fail(
            "B9_BROWSER_AI_PROPOSAL_REJECTED_BY_VALIDATOR",
            json.dumps(
                {
                    "status": response.status,
                    "validation": payload.get("validation"),
                    "attempts": report["presentationProviderAttempts"],
                },
                sort_keys=True,
            ),
        )
    if response.status != 201:
        fail(
            "B9_BROWSER_PRESENTATION_PROPOSAL_HTTP_FAILURE",
            json.dumps(
                {
                    "status": response.status,
                    "error": payload.get("error"),
                    "failureCode": payload.get("failureCode"),
                },
                sort_keys=True,
            ),
        )

    report["checks"].append("PRESENTATION_PROPOSAL_HTTP_201_OBSERVED")
    try:
        review = evidence_card.locator("section.presentation-review")
        review.get_by_role("heading", name="Review wording before it can be used.").wait_for(timeout=30_000)
    except PlaywrightTimeoutError:
        page_errors = " | ".join(page.get_by_role("alert").all_text_contents())
        fail("B9_BROWSER_AI_PROPOSAL_REVIEW_NOT_RENDERED_AFTER_201", page_errors or evidence_card.inner_text())

    review = evidence_card.locator("section.presentation-review")
    before = review.locator(".presentation-diff article").nth(0).locator("p").inner_text().strip()
    proposed = review.locator(".presentation-diff article").nth(1).locator("p").inner_text().strip()
    if before != SOURCE_TEXT:
        fail("B9_BROWSER_PRESENTATION_BEFORE_NOT_EXACT_SOURCE", before)
    if not proposed:
        fail("B9_BROWSER_PRESENTATION_PROPOSAL_EMPTY")
    if "Validator PASS" not in review.inner_text():
        fail("B9_BROWSER_PRESENTATION_VALIDATOR_PASS_NOT_VISIBLE")

    review.get_by_role("button", name="Approve wording").click()
    evidence_card.get_by_text("Presentation wording approved. Career Evidence remains unchanged.", exact=True).wait_for(timeout=30_000)
    if SOURCE_TEXT not in evidence_card.locator("p.evidence-text").inner_text():
        fail("B9_BROWSER_PRESENTATION_MUTATED_CAREER_EVIDENCE")

    report["presentationChangedText"] = proposed != SOURCE_TEXT
    report["checks"].append("PRESENTATION_BEFORE_AFTER_VALIDATED_AND_APPROVED")
    return proposed


def run_browser(report: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_docx = OUTPUT_DIR / "synthetic-input.docx"
    write_synthetic_docx(source_docx)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        account_deleted = False
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)
            page.get_by_label("I understand this disclosure and will review career/application content before using it.").check()
            page.get_by_role("button", name="Acknowledge and continue").click()

            page.get_by_role("button", name="Create an account").click()
            page.get_by_label("Email", exact=True).fill(SYNTHETIC_EMAIL)
            page.get_by_label("Password", exact=True).fill(SYNTHETIC_PASSWORD)
            page.get_by_role("button", name="Create account", exact=True).click()
            try:
                page.get_by_role("heading", name="Choose how CV Engine may use AI").wait_for(timeout=30_000)
            except PlaywrightTimeoutError:
                statuses = " | ".join(page.get_by_role("status").all_text_contents())
                if "Check your email" in statuses:
                    fail("B9_BROWSER_SIGNUP_REQUIRES_EMAIL_CONFIRMATION")
                fail("B9_BROWSER_AUTH_DID_NOT_ADVANCE", statuses)

            platform_ai = page.get_by_role("radio", name=re.compile("Use CV Engine AI", re.I))
            if platform_ai.count() != 1:
                fail("B9_BROWSER_PLATFORM_AI_NOT_AVAILABLE")
            platform_ai.click()
            page.get_by_role("button", name="Continue to CV Engine").click()
            page.get_by_role("heading", name="Build the career evidence you can defend.").wait_for(timeout=30_000)
            report["checks"].append("PLATFORM_AI_SELECTED")

            page.get_by_role("button", name="Resume Import", exact=True).click()
            page.get_by_label("Resume file").set_input_files(str(source_docx))
            page.get_by_role("button", name="Extract review proposals").click()
            page.get_by_text(SOURCE_TEXT, exact=True).wait_for(timeout=30_000)
            proposal_select = page.locator('select[aria-label^="Evidence kind for proposal"]').first
            proposal_select.select_option("PROJECT")
            page.get_by_role("button", name="Accept as NEEDS_REVIEW", exact=True).click()
            page.get_by_text(re.compile("Created Career Evidence")).wait_for(timeout=30_000)
            report["checks"].append("DOCX_UPLOAD_AND_REVIEW_PROPOSAL")

            page.get_by_role("button", name="Career Evidence", exact=True).click()
            evidence_card = page.locator("article.evidence-card").filter(has_text=SOURCE_TEXT).first
            evidence_card.wait_for(timeout=30_000)
            evidence_card.get_by_role("button", name="Edit as new revision").click()
            evidence_card.get_by_label("I can defend this revised statement as true.").check()
            evidence_card.get_by_role("button", name="Save revision").click()
            evidence_card.get_by_text("Defensible", exact=True).wait_for(timeout=30_000)
            report["checks"].append("IMPORTED_EVIDENCE_EXPLICITLY_VERIFIED")

            rendered_text = create_and_approve_presentation(evidence_card, report)

            page.get_by_role("button", name="Career Target", exact=True).click()
            page.get_by_label("Target role").fill(TARGET_ROLE)
            page.get_by_role("button", name="Save and activate target").click()
            page.get_by_role("heading", name=TARGET_ROLE, exact=True).wait_for(timeout=30_000)
            report["checks"].append("CAREER_TARGET_ACTIVE")

            page.get_by_role("button", name="Resume", exact=True).click()
            page.get_by_role("heading", name="Turn verified career truth into a professional, provenance-backed resume.").wait_for(timeout=30_000)
            page.get_by_label("Display name").fill(CANDIDATE_NAME)
            page.get_by_label("Professional headline").fill("Backend Engineer")
            page.get_by_label("Location").fill("Synthetic City")
            page.get_by_label("Email", exact=True).fill(SYNTHETIC_EMAIL)
            page.get_by_label("Links · one per line").fill("https://example.test/cvengine")
            page.get_by_role("button", name="Save ResumeProfile").click()
            page.get_by_text(re.compile(r"ResumeProfile r1 saved")).wait_for(timeout=30_000)
            page.get_by_label("Resume mode").select_option("GENERAL")
            page.get_by_role("button", name="Create professional ResumeArtifact").click()
            page.get_by_text(re.compile("ResumeArtifact created from ResumePlan")).wait_for(timeout=30_000)
            artifact_card = page.locator("article.evidence-card").filter(has_text=CANDIDATE_NAME).first
            artifact_card.wait_for(timeout=30_000)
            if rendered_text not in artifact_card.inner_text():
                fail("B9_BROWSER_PREVIEW_MISSING_APPROVED_PRESENTATION")
            report["checks"].append("GENERAL_RESUME_ARTIFACT_CREATED_FROM_APPROVED_PRESENTATION")

            txt = download_bytes(artifact_card, "TXT").decode("utf-8")
            provenance_bytes = download_bytes(artifact_card, "Provenance JSON")
            docx = download_bytes(artifact_card, "Download DOCX")
            pdf = download_bytes(artifact_card, "Download PDF")
            if CANDIDATE_NAME not in txt or rendered_text not in txt:
                fail("B9_BROWSER_TXT_CANONICAL_CONTENT_MISMATCH")
            provenance = json.loads(provenance_bytes.decode("utf-8"))
            if provenance.get("schemaVersion") != "b9-resume-artifact-provenance-v2":
                fail("B9_BROWSER_PROVENANCE_SCHEMA_MISMATCH")
            manifest = provenance.get("manifest") or {}
            receipts = manifest.get("receipts") or []
            if manifest.get("resumeProfileRevision") != 1 or len(receipts) != 1:
                fail("B9_BROWSER_PROVENANCE_INCOMPLETE")
            receipt = receipts[0]
            if not receipt.get("presentationRevisionId") or not receipt.get("presentationTextSha256"):
                fail("B9_BROWSER_APPROVED_PRESENTATION_PROVENANCE_MISSING")
            if receipt.get("renderedTextSha256") != receipt.get("presentationTextSha256"):
                fail("B9_BROWSER_PRESENTATION_RENDERED_HASH_MISMATCH")
            assert_docx(docx, rendered_text)
            assert_pdf(pdf, rendered_text)
            (OUTPUT_DIR / "artifact.txt").write_text(txt, encoding="utf-8")
            (OUTPUT_DIR / "artifact-provenance.json").write_bytes(provenance_bytes)
            report["artifactId"] = provenance.get("artifactId")
            report["artifactSemanticSha256"] = provenance.get("artifactSemanticSha256")
            report["checks"].append("DOCX_PDF_TXT_PROVENANCE_PARITY")

            page.reload(wait_until="networkidle", timeout=60_000)
            page.get_by_role("button", name="Resume", exact=True).wait_for(timeout=30_000)
            page.get_by_role("button", name="Resume", exact=True).click()
            reloaded_card = page.locator("article.evidence-card").filter(has_text=CANDIDATE_NAME).first
            reloaded_card.wait_for(timeout=30_000)
            if rendered_text not in reloaded_card.inner_text():
                fail("B9_BROWSER_HISTORICAL_ARTIFACT_RELOAD_MISMATCH")
            report["checks"].append("HISTORICAL_ARTIFACT_RELOAD")

            page.screenshot(path=str(OUTPUT_DIR / "artifact-preview.png"), full_page=True)

            page.get_by_role("button", name="Account", exact=True).click()
            with page.expect_download(timeout=30_000) as account_download_info:
                page.get_by_role("button", name="Download my account data").click()
            account_path = account_download_info.value.path()
            if account_path is None:
                fail("B9_BROWSER_ACCOUNT_EXPORT_DOWNLOAD_MISSING")
            account_export = json.loads(Path(account_path).read_text(encoding="utf-8"))
            if len(account_export.get("resumeArtifacts", [])) < 1 or len(account_export.get("resumeProfileRevisions", [])) < 1:
                fail("B9_BROWSER_ACCOUNT_EXPORT_B9_STATE_MISSING")
            if len(account_export.get("presentationRevisions", [])) < 1:
                fail("B9_BROWSER_ACCOUNT_EXPORT_PRESENTATION_STATE_MISSING")
            report["checks"].append("ACCOUNT_EXPORT_INCLUDES_B9")

            page.get_by_label(re.compile("Type DELETE_MY_ACCOUNT to continue")).fill("DELETE_MY_ACCOUNT")
            page.once("dialog", lambda dialog: dialog.accept())
            page.get_by_role("button", name="Permanently delete my account").click()
            page.get_by_role("heading", name="Your career evidence stays separate from AI suggestions.").wait_for(timeout=30_000)
            account_deleted = True
            session = context.request.get(f"{BASE_URL}/api/session", timeout=15_000)
            if session.status != 401:
                fail("B9_BROWSER_POST_DELETE_SESSION_NOT_DENIED", str(session.status))
            report["checks"].append("ACCOUNT_DELETE_AND_SESSION_DENIAL")
        finally:
            try:
                if not account_deleted:
                    cleanup_account(context)
                page.screenshot(path=str(OUTPUT_DIR / "final-state.png"), full_page=True)
            except Exception:
                pass
            context.close()
            browser.close()


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "schemaVersion": "b9-production-browser-receipt-v2",
        "baseUrl": BASE_URL,
        "expectedGitCommitSha": EXPECTED_SHA,
        "observedRuntime": None,
        "status": "FAIL",
        "checks": [],
    }
    try:
        runtime = wait_for_exact_runtime()
        report["observedRuntime"] = runtime
        run_browser(report)
        report["status"] = "PASS"
        return 0
    except Exception as error:
        report["error"] = str(error)
        report["traceback"] = traceback.format_exc(limit=8)
        print(str(error), file=sys.stderr)
        return 1
    finally:
        (OUTPUT_DIR / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
