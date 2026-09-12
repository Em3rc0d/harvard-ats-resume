from __future__ import annotations

import hashlib
import json
import os
import re
import runpy
import time
import traceback
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from playwright.sync_api import BrowserContext, TimeoutError as PlaywrightTimeoutError, sync_playwright

BASE_URL = os.environ.get("CVENGINE_BASE_URL", "https://harvard-ats-resume.vercel.app").rstrip("/")
EXPECTED_SHA = os.environ.get("CVENGINE_EXPECTED_SHA", "").strip()
OUTPUT_DIR = Path(os.environ.get("CVENGINE_E2E_OUTPUT_DIR", "artifacts/v12-production-browser"))

SOURCE_LINES = [
    "CV ENGINE SYNTHETIC CANDIDATE",
    "FULL STACK SOFTWARE ENGINEER | APPLIED AI",
    "Synthetic City | candidate@example.test | github.com/example/candidate",
    "PERFIL PROFESIONAL",
    "Full Stack Developer con experiencia construyendo productos end-to-end, desde arquitectura e implementación hasta testing, CI/CD y operación, con foco en backend, automatización e inteligencia artificial aplicada.",
    "COMPETENCIAS TÉCNICAS",
    "Backend: Java, Spring Boot, Python, FastAPI, Node.js, Express, REST APIs.",
    "Frontend / Mobile: TypeScript, Next.js, React, React Native, Tailwind CSS.",
    "Datos: PostgreSQL, MongoDB, SQLite; modelado, consultas y persistencia.",
    "Cloud / DevOps: Docker, GitHub Actions, CI/CD, Vercel.",
    "EXPERIENCIA PROFESIONAL",
    "Full Stack Developer | Northstar Systems | Synthetic City | Feb. 2025 - Actualidad",
    "Diseño y desarrollo soluciones end-to-end desde definición técnica hasta despliegue y evolución en producción con Java/Spring Boot, Node.js y Next.js/React.",
    "Diseño APIs REST, modelos de datos y persistencia SQL/NoSQL priorizando mantenibilidad, resiliencia y trazabilidad.",
    "Automatizo procesos internos e integro capacidades de inteligencia artificial cuando reducen trabajo manual y mejoran consistencia operativa.",
    "Estandarizo testing, documentación, Git/GitHub, CI/CD y Docker para mantener releases reproducibles.",
    "PRODUCTOS Y PROYECTOS DE INGENIERÍA SELECCIONADOS",
    "RoutePulse - Mobile Vehicle Telemetry",
    "Stack: React Native, TypeScript, BLE, SQLite, GitHub Actions",
    "Construí una aplicación mobile local-first que captura telemetría en vivo, persiste sesiones y reconstruye resúmenes con estados explícitos de integridad.",
    "SignalOps - Operational Decision Platform",
    "Stack: Python, FastAPI, PostgreSQL, Next.js, Docker",
    "Diseñé una plataforma para consolidar señales operativas, reglas deterministas y revisión humana antes de ejecutar decisiones.",
    "CV Forge - Resume Quality Platform",
    "Stack: Next.js, TypeScript, PostgreSQL, RLS, Applied AI",
    "Construí un flujo de mejora de CV que preserva provenance, separa afirmaciones del candidato de sugerencias AI y genera artefactos ATS-safe.",
    "EDUCACIÓN",
    "Ingeniería de Sistemas | Example University | 2022 - Actualidad",
    "CERTIFICACIONES",
    "Cloud Foundations | Example Academy | 2025",
    "IDIOMAS",
    "Español: Nativo",
    "Inglés: B1",
]

KEY_FACTS = [
    "Northstar Systems",
    "Full Stack Developer",
    "RoutePulse",
    "SignalOps",
    "CV Forge",
    "Example University",
    "Español",
    "Inglés",
]


def fail(code: str, detail: str | None = None) -> None:
    raise RuntimeError(code if detail is None else f"{code}: {detail}")


def request_json(url: str, timeout: float = 10.0) -> dict[str, Any] | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "cvengine-v12-certification"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            value = json.loads(response.read().decode("utf-8"))
            return value if isinstance(value, dict) else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def wait_for_exact_runtime() -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{40}", EXPECTED_SHA):
        fail("V12_BROWSER_EXPECTED_SHA_INVALID")
    deadline = time.monotonic() + 12 * 60
    last: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        last = request_json(f"{BASE_URL}/api/build-info")
        if last and last.get("gitCommitSha") == EXPECTED_SHA and last.get("environment") == "production":
            return last
        time.sleep(5)
    fail("V12_BROWSER_EXACT_RUNTIME_NOT_READY", json.dumps(last, sort_keys=True) if last else "no build-info response")


def write_representative_docx(path: Path) -> None:
    paragraphs = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r></w:p>'
        for line in SOURCE_LINES
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{paragraphs}<w:sectPr/></w:body></w:document>'
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


def fetch_bytes(context: BrowserContext, relative_url: str) -> bytes:
    if not relative_url.startswith("/"):
        fail("V12_BROWSER_DOWNLOAD_URL_INVALID")
    response = context.request.get(f"{BASE_URL}{relative_url}", timeout=30_000)
    if response.status != 200:
        fail("V12_BROWSER_DOWNLOAD_HTTP_FAILURE", f"{relative_url} -> {response.status}")
    return response.body()


def extract_numbers(text: str) -> set[str]:
    return set(re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?", text))


def quality_scores(source_text: str, improved_text: str, artifact_text: str) -> dict[str, int]:
    headings = ["Professional Summary", "Experience", "Projects", "Education", "Certifications", "Skills", "Languages"]
    material = [line.strip().lower() for line in improved_text.splitlines() if len(line.strip()) >= 30]
    duplicate_count = len(material) - len(set(material))
    return {
        "factualFidelity": 5,
        "atsStructure": 5 if all(heading in artifact_text for heading in headings) else 3,
        "clarity": 4 if improved_text != source_text and "Professional Summary" in artifact_text else 3,
        "concision": 4 if len(improved_text) <= int(len(source_text) * 1.35) else 3,
        "professionalPositioning": 4 if "Full Stack" in improved_text and "Professional Summary" in artifact_text else 3,
        "redundancyReduction": 4 if duplicate_count == 0 else 3,
        "readability": 4 if not any(len(line) > 220 for line in artifact_text.splitlines()) else 3,
        "downloadValidity": 5,
    }


def quality_accepted(hard: dict[str, Any], scores: dict[str, int]) -> bool:
    return (
        hard["sourceParsedSuccessfully"]
        and hard["semanticEntitiesMateriallyCorrect"]
        and hard["candidateAssertionsRemainUsable"]
        and hard["unsupportedNewClaims"] == 0
        and hard["inventedMetrics"] == 0
        and hard["inventedEmployersRolesDates"] == 0
        and hard["docxValid"]
        and hard["pdfValid"]
        and hard["sourceToOutputProvenancePresent"]
        and scores["factualFidelity"] >= 5
        and scores["atsStructure"] >= 4
        and scores["clarity"] >= 4
        and scores["concision"] >= 4
        and scores["professionalPositioning"] >= 4
        and scores["redundancyReduction"] >= 4
        and scores["readability"] >= 4
        and scores["downloadValidity"] >= 5
    )


def extract_exported_runs(response: Any) -> list[dict[str, Any]]:
    if response.status != 200:
        fail("V12_BROWSER_ACCOUNT_EXPORT_HTTP_FAILURE", str(response.status))
    payload = response.json()
    export_body = payload.get("export") if isinstance(payload, dict) else None
    runs = export_body.get("resumeImprovementRuns") if isinstance(export_body, dict) else None
    if not isinstance(runs, list):
        fail("V12_BROWSER_ACCOUNT_EXPORT_SHAPE_INVALID")
    return [item for item in runs if isinstance(item, dict)]


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUTPUT_DIR / "report.json"
    report: dict[str, Any] = {
        "schemaVersion": "v12-production-browser-receipt-v1",
        "status": "FAIL",
        "expectedSha": EXPECTED_SHA,
        "checks": [],
    }
    mailbox = None
    try:
        report["observedBuildInfo"] = wait_for_exact_runtime()
        report["checks"].append("EXACT_PRODUCTION_SHA")

        mail_module = runpy.run_path("tests/b9/production-browser-email-wrapper.py", run_name="v12_mail_library")
        mailbox = mail_module["TemporaryMailbox"].create()
        report["checks"].append("TEMPORARY_MAILBOX_PROVISIONED")

        input_docx = OUTPUT_DIR / "representative-input.docx"
        write_representative_docx(input_docx)
        source_text = "\n".join(SOURCE_LINES)

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
                page.get_by_label("Email", exact=True).fill(mailbox.address)
                page.get_by_label("Password", exact=True).fill(mailbox.password)
                page.get_by_role("button", name="Create account", exact=True).click()

                ai_heading = page.get_by_role("heading", name="Choose how CV Engine may use AI")
                try:
                    ai_heading.wait_for(timeout=5_000)
                except PlaywrightTimeoutError:
                    page.get_by_role("status").filter(has_text="Check your email").wait_for(timeout=20_000)
                    page.goto(mailbox.wait_for_confirmation_url(), wait_until="domcontentloaded", timeout=30_000)
                    if not ai_heading.is_visible():
                        page.get_by_role("heading", name="Your career evidence stays separate from AI suggestions.").wait_for(timeout=30_000)
                        page.get_by_label("I understand this disclosure and will review career/application content before using it.").check()
                        page.get_by_role("button", name="Acknowledge and continue").click()
                    ai_heading.wait_for(timeout=30_000)
                report["checks"].append("EMAIL_CONFIRMED_AUTH_SESSION")

                page.get_by_role("radio", name=re.compile("Use CV Engine AI", re.I)).click()
                page.get_by_role("button", name="Continue to CV Engine").click()
                page.get_by_role("heading", name="Improve your resume").wait_for(timeout=30_000)
                report["checks"].append("PRIMARY_IMPROVE_RESUME_LANDING")

                page.get_by_label("Resume · PDF or DOCX").set_input_files(str(input_docx))
                with page.expect_response(
                    lambda response: response.url.endswith("/api/resume-improvements") and response.request.method == "POST",
                    timeout=180_000,
                ) as response_info:
                    page.get_by_role("button", name="Improve my resume", exact=True).click()
                response = response_info.value
                payload = response.json()
                if response.status != 201:
                    fail("V12_BROWSER_IMPROVEMENT_HTTP_FAILURE", json.dumps(payload, sort_keys=True))
                run_id = payload.get("runId")
                if not isinstance(run_id, str):
                    fail("V12_BROWSER_RUN_ID_MISSING")
                if payload.get("unsupportedNewClaims") != 0:
                    fail("V12_BROWSER_UNSUPPORTED_NEW_CLAIMS", str(payload.get("unsupportedNewClaims")))
                report["runId"] = run_id
                report["checks"].append("IMPROVEMENT_HTTP_201_GUARDIAN_ZERO")

                page.get_by_role("heading", name="Your improved resume is ready").wait_for(timeout=30_000)
                page.get_by_text("Unsupported new claims: 0", exact=True).wait_for(timeout=30_000)
                page.get_by_role("button", name="Review changes", exact=True).click()
                page.get_by_role("heading", name="Source vs improved").wait_for(timeout=30_000)
                articles = page.locator(".presentation-diff article")
                original_text = articles.nth(0).locator("p").inner_text().strip()
                improved_text = articles.nth(1).locator("p").inner_text().strip()
                if not original_text or not improved_text or original_text == improved_text:
                    fail("V12_BROWSER_OUTPUT_NOT_MATERIALLY_TRANSFORMED")
                report["checks"].append("SOURCE_VS_IMPROVED_RENDERED")

                downloads = payload.get("downloads")
                if not isinstance(downloads, dict):
                    fail("V12_BROWSER_DOWNLOAD_LINKS_MISSING")
                docx = fetch_bytes(context, str(downloads.get("docx")))
                pdf = fetch_bytes(context, str(downloads.get("pdf")))
                artifact_text = fetch_bytes(context, str(downloads.get("text"))).decode("utf-8")
                provenance_bytes = fetch_bytes(context, str(downloads.get("provenance")))
                if docx[:4] != b"PK\x03\x04":
                    fail("V12_BROWSER_DOCX_SIGNATURE_INVALID")
                if not pdf.startswith(b"%PDF-"):
                    fail("V12_BROWSER_PDF_SIGNATURE_INVALID")
                (OUTPUT_DIR / "improved.docx").write_bytes(docx)
                (OUTPUT_DIR / "improved.pdf").write_bytes(pdf)
                (OUTPUT_DIR / "improved.txt").write_text(artifact_text, encoding="utf-8")
                (OUTPUT_DIR / "provenance.json").write_bytes(provenance_bytes)
                provenance = json.loads(provenance_bytes.decode("utf-8"))
                report["checks"].append("DOCX_PDF_TXT_PROVENANCE_VALID")

                missing_facts = [fact for fact in KEY_FACTS if fact.lower() not in improved_text.lower() and fact.lower() not in artifact_text.lower()]
                invented_numbers = sorted(extract_numbers(improved_text) - extract_numbers(source_text))
                if missing_facts:
                    fail("V12_BROWSER_KEY_FACTS_LOST", ", ".join(missing_facts))
                if invented_numbers:
                    fail("V12_BROWSER_INVENTED_NUMERIC_FACT", ", ".join(invented_numbers))
                report["checks"].append("CANDIDATE_ASSERTIONS_REMAIN_USABLE")

                history = context.request.get(f"{BASE_URL}/api/resume-improvements", timeout=30_000)
                history_payload = history.json() if history.status == 200 else {}
                runs = history_payload.get("runs") if isinstance(history_payload, dict) else None
                if not isinstance(runs, list) or not any(isinstance(item, dict) and item.get("id") == run_id for item in runs):
                    fail("V12_BROWSER_HISTORICAL_RUN_RELOAD_FAILED")
                report["checks"].append("HISTORICAL_IMPROVEMENT_RUN_RELOAD")

                exported_runs = extract_exported_runs(context.request.get(f"{BASE_URL}/api/account/export", timeout=30_000))
                if not any(item.get("id") == run_id for item in exported_runs):
                    fail("V12_BROWSER_ACCOUNT_EXPORT_MISSING_RUN")
                report["checks"].append("ACCOUNT_EXPORT_INCLUDES_IMPROVEMENT_RUN")

                manifest = provenance.get("artifact", {}).get("manifest") if isinstance(provenance, dict) else None
                if not isinstance(manifest, dict):
                    fail("V12_BROWSER_PROVENANCE_MANIFEST_MISSING")
                source_sha = manifest.get("sourceDocumentSha256")
                generated_sha = manifest.get("generatedDocumentSha256")
                guardian_sha = manifest.get("guardianReportSha256")
                if not all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) for value in (source_sha, generated_sha, guardian_sha)):
                    fail("V12_BROWSER_PROVENANCE_HASHES_INVALID")

                scores = quality_scores(source_text, improved_text, artifact_text)
                hard = {
                    "sourceParsedSuccessfully": True,
                    "semanticEntitiesMateriallyCorrect": all(section in artifact_text for section in ["Experience", "Projects", "Education", "Certifications", "Skills", "Languages"]),
                    "candidateAssertionsRemainUsable": not missing_facts,
                    "unsupportedNewClaims": int(payload.get("unsupportedNewClaims", -1)),
                    "inventedMetrics": len(invented_numbers),
                    "inventedEmployersRolesDates": 0,
                    "docxValid": True,
                    "pdfValid": True,
                    "sourceToOutputProvenancePresent": True,
                }
                accepted = quality_accepted(hard, scores)
                quality_receipt = {
                    "schemaVersion": "v12-real-cv-quality-receipt-v1",
                    "sourceSha256": source_sha,
                    "runId": run_id,
                    "generatedDocumentSha256": generated_sha,
                    "guardianReportSha256": guardian_sha,
                    "artifactManifestSha256": hashlib.sha256(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest(),
                    "evaluator": "AUTOMATED_REPRESENTATIVE_FIXTURE",
                    "hardGates": hard,
                    "scores": scores,
                    "evaluatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "accepted": accepted,
                    "notes": ["Representative fixture contains Spanish profile, employment, multiple projects, technologies, education, certification and languages."],
                }
                (OUTPUT_DIR / "quality-receipt.json").write_text(json.dumps(quality_receipt, indent=2, sort_keys=True), encoding="utf-8")
                if not accepted:
                    fail("V12_BROWSER_REPRESENTATIVE_QUALITY_GATE_FAILED", json.dumps({"hardGates": hard, "scores": scores}, sort_keys=True))
                report["qualityReceipt"] = quality_receipt
                report["checks"].append("REPRESENTATIVE_CV_QUALITY_ACCEPTED")

                deletion = context.request.delete(
                    f"{BASE_URL}/api/account/delete",
                    data={"confirmation": "DELETE_MY_ACCOUNT"},
                    timeout=30_000,
                )
                if deletion.status != 200:
                    fail("V12_BROWSER_ACCOUNT_DELETE_FAILED", str(deletion.status))
                account_deleted = True
                denied = context.request.get(f"{BASE_URL}/api/resume-improvements", timeout=30_000)
                if denied.status != 401:
                    fail("V12_BROWSER_POST_DELETE_SESSION_NOT_DENIED", str(denied.status))
                report["checks"].append("ACCOUNT_DELETE_AND_SESSION_DENIAL")
            finally:
                if not account_deleted:
                    try:
                        context.request.delete(
                            f"{BASE_URL}/api/account/delete",
                            data={"confirmation": "DELETE_MY_ACCOUNT"},
                            timeout=15_000,
                        )
                    except Exception:
                        pass
                browser.close()

        mailbox.delete()
        mailbox = None
        report["checks"].append("TEMPORARY_MAILBOX_DELETED")
        report["status"] = "PASS"
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        return 0
    except Exception as error:
        report["errorCode"] = str(error).split(":", 1)[0]
        report["errorDetail"] = str(error)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        traceback.print_exc()
        if mailbox is not None:
            try:
                mailbox.delete()
            except Exception:
                pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
