from __future__ import annotations

import html
import json
import os
import re
import runpy
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

# External certification-only inbox provider. Public attribution required by the
# provider and intentionally kept out of the CV Engine product runtime:
# https://mail.tm
MAILTM_BASE_URL = "https://api.mail.tm"
MAILTM_ACCEPT = "application/ld+json"
SUPABASE_CONFIRM_HOST = "zqcwlnshtsectitagkca.supabase.co"
SOURCE_PATH = Path("tests/b9/production-browser-e2e.py")
OUTPUT_DIR = Path(os.environ.get("CVENGINE_E2E_OUTPUT_DIR", "artifacts/b9-production-browser"))
PATCHED_PATH = OUTPUT_DIR / "patched-production-browser-e2e.py"
WRAPPER_REPORT_PATH = OUTPUT_DIR / "wrapper-report.json"
BASE_URL = os.environ.get("CVENGINE_BASE_URL", "https://harvard-ats-resume.vercel.app").rstrip("/")
RUN_ID = os.environ.get("GITHUB_RUN_ID", "local")
RUN_ATTEMPT = os.environ.get("GITHUB_RUN_ATTEMPT", "1")

CREDENTIAL_ANCHOR = '''SYNTHETIC_EMAIL = f"cvengine-b9-{RUN_ID}-{RUN_ATTEMPT}@example.com"
SYNTHETIC_PASSWORD = f"B9-Cert-{RUN_ID}-{RUN_ATTEMPT}-A1!"
'''

CREDENTIAL_REPLACEMENT = '''SYNTHETIC_EMAIL = CERT_AUTH_EMAIL
SYNTHETIC_PASSWORD = CERT_AUTH_PASSWORD
'''

AUTH_FLOW_ANCHOR = '''            page.get_by_role("button", name="Create an account").click()
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
'''

AUTH_FLOW_REPLACEMENT = '''            page.get_by_role("button", name="Create an account").click()
            page.get_by_label("Email", exact=True).fill(SYNTHETIC_EMAIL)
            page.get_by_label("Password", exact=True).fill(SYNTHETIC_PASSWORD)
            page.get_by_role("button", name="Create account", exact=True).click()

            try:
                page.get_by_role("heading", name="Choose how CV Engine may use AI").wait_for(timeout=5_000)
            except PlaywrightTimeoutError:
                try:
                    page.get_by_role("status").filter(has_text="Check your email").wait_for(timeout=15_000)
                except PlaywrightTimeoutError:
                    statuses = " | ".join(page.get_by_role("status").all_text_contents())
                    lowered = statuses.lower()
                    if "rate limit" in lowered or "too many requests" in lowered:
                        fail("B9_BROWSER_EMAIL_SIGNUP_RATE_LIMITED", statuses)
                    fail("B9_BROWSER_AUTH_DID_NOT_ADVANCE", statuses)

                confirmation_url = CERT_AUTH_WAIT_FOR_CONFIRMATION()
                page.goto(confirmation_url, wait_until="networkidle", timeout=60_000)

                ai_heading = page.get_by_role("heading", name="Choose how CV Engine may use AI")
                if not ai_heading.is_visible():
                    trust_heading = page.get_by_role(
                        "heading",
                        name="Your career evidence stays separate from AI suggestions.",
                    )
                    trust_heading.wait_for(timeout=30_000)
                    page.get_by_label(
                        "I understand this disclosure and will review career/application content before using it."
                    ).check()
                    page.get_by_role("button", name="Acknowledge and continue").click()

                ai_heading.wait_for(timeout=30_000)
                report["checks"].append("EMAIL_CONFIRMED_AUTH_SESSION")
'''


class MailboxError(RuntimeError):
    pass


def _error_code(error: BaseException) -> str:
    text = str(error).strip()
    return text.split(":", 1)[0] if text else error.__class__.__name__


def _write_wrapper_report(report: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    WRAPPER_REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")


def _request_json(
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> dict[str, Any] | list[Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": MAILTM_ACCEPT,
        "User-Agent": "cvengine-b9-certification",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for attempt in range(3):
        request = urllib.request.Request(
            f"{MAILTM_BASE_URL}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status not in (200, 201, 204):
                    raise MailboxError(f"B9_CERT_MAIL_API_HTTP_{response.status}")
                raw = response.read()
                if not raw:
                    return {}
                parsed = json.loads(raw.decode("utf-8"))
                if not isinstance(parsed, (dict, list)):
                    raise MailboxError("B9_CERT_MAIL_API_JSON_SHAPE_UNSUPPORTED")
                return parsed
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 2:
                time.sleep(1.0 + attempt)
                continue
            raise MailboxError(f"B9_CERT_MAIL_API_HTTP_{error.code}") from None
        except (urllib.error.URLError, TimeoutError):
            if attempt < 2:
                time.sleep(1.0 + attempt)
                continue
            raise MailboxError("B9_CERT_MAIL_API_UNREACHABLE") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise MailboxError("B9_CERT_MAIL_API_INVALID_JSON") from None

    raise MailboxError("B9_CERT_MAIL_API_UNREACHABLE")


def _as_object(payload: dict[str, Any] | list[Any], code: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise MailboxError(code)
    return payload


def _collection_members(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    hydra_members = payload.get("hydra:member")
    if isinstance(hydra_members, list):
        return [item for item in hydra_members if isinstance(item, dict)]

    data = payload.get("data")
    if isinstance(data, list):
        normalized: list[dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            attributes = item.get("attributes")
            if isinstance(attributes, dict):
                normalized.append({**attributes, **({"id": item.get("id")} if item.get("id") else {})})
            else:
                normalized.append(item)
        return normalized

    embedded = payload.get("_embedded")
    if isinstance(embedded, dict):
        for value in embedded.values():
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

    raise MailboxError("B9_CERT_MAIL_COLLECTION_SHAPE_UNSUPPORTED")


def _candidate_urls(value: str) -> list[str]:
    decoded = html.unescape(value)
    return [
        item.rstrip(".,);]")
        for item in re.findall(r"https://[^\s\"'<>]+", decoded)
    ]


def _valid_confirmation_url(value: str) -> str | None:
    base = urllib.parse.urlparse(BASE_URL)
    for candidate in _candidate_urls(value):
        parsed = urllib.parse.urlparse(candidate)
        if parsed.scheme != "https" or parsed.hostname != SUPABASE_CONFIRM_HOST:
            continue
        if parsed.path != "/auth/v1/verify":
            continue
        query = urllib.parse.parse_qs(parsed.query)
        auth_type = (query.get("type") or [""])[0]
        if auth_type not in {"signup", "email"}:
            continue
        redirect_to = (query.get("redirect_to") or [""])[0]
        if redirect_to:
            redirect = urllib.parse.urlparse(redirect_to)
            if (redirect.scheme, redirect.netloc) != (base.scheme, base.netloc):
                continue
            if redirect.path != "/auth/callback":
                continue
        return candidate
    return None


class TemporaryMailbox:
    def __init__(self, address: str, password: str, account_id: str, token: str):
        self.address = address
        self.password = password
        self.account_id = account_id
        self.token = token

    @classmethod
    def create(cls) -> "TemporaryMailbox":
        domains_payload = _request_json("GET", "/domains")
        candidates = [
            item.get("domain")
            for item in _collection_members(domains_payload)
            if item.get("isActive") is True
            and item.get("isPrivate") is not True
            and isinstance(item.get("domain"), str)
        ]
        if not candidates:
            raise MailboxError("B9_CERT_MAIL_NO_ACTIVE_DOMAIN")

        address = f"cvengine-b9-mail-{RUN_ID}-{RUN_ATTEMPT}@{candidates[0]}"
        password = secrets.token_urlsafe(36) + "A1!"
        account = _as_object(
            _request_json(
                "POST",
                "/accounts",
                payload={"address": address, "password": password},
            ),
            "B9_CERT_MAIL_ACCOUNT_SHAPE_UNSUPPORTED",
        )
        account_id = account.get("id")
        if not isinstance(account_id, str) or not account_id:
            raise MailboxError("B9_CERT_MAIL_ACCOUNT_ID_MISSING")

        auth = _as_object(
            _request_json(
                "POST",
                "/token",
                payload={"address": address, "password": password},
            ),
            "B9_CERT_MAIL_TOKEN_SHAPE_UNSUPPORTED",
        )
        token = auth.get("token")
        if not isinstance(token, str) or not token:
            raise MailboxError("B9_CERT_MAIL_TOKEN_MISSING")
        return cls(address, password, account_id, token)

    def wait_for_confirmation_url(self, timeout_seconds: float = 120.0) -> str:
        deadline = time.monotonic() + timeout_seconds
        saw_message = False
        inspected: set[str] = set()

        while time.monotonic() < deadline:
            listing = _request_json("GET", "/messages", token=self.token)
            for item in _collection_members(listing):
                message_id = item.get("id")
                if not isinstance(message_id, str) or not message_id or message_id in inspected:
                    continue
                inspected.add(message_id)
                saw_message = True
                detail = _as_object(
                    _request_json("GET", f"/messages/{message_id}", token=self.token),
                    "B9_CERT_MAIL_MESSAGE_SHAPE_UNSUPPORTED",
                )

                fields: list[str] = []
                verifications = detail.get("verifications")
                if isinstance(verifications, list):
                    fields.extend(value for value in verifications if isinstance(value, str))
                text = detail.get("text")
                if isinstance(text, str):
                    fields.append(text)
                html_parts = detail.get("html")
                if isinstance(html_parts, list):
                    fields.extend(value for value in html_parts if isinstance(value, str))

                for field in fields:
                    confirmation = _valid_confirmation_url(field)
                    if confirmation:
                        return confirmation
            time.sleep(2.5)

        if saw_message:
            raise MailboxError("B9_BROWSER_EMAIL_CONFIRMATION_LINK_NOT_FOUND")
        raise MailboxError("B9_BROWSER_EMAIL_CONFIRMATION_NOT_RECEIVED")

    def delete(self) -> None:
        _request_json("DELETE", f"/accounts/{self.account_id}", token=self.token)


def main() -> int:
    report: dict[str, Any] = {
        "schemaVersion": "b9-production-browser-wrapper-receipt-v1",
        "status": "FAIL",
        "phase": "PRE_HARNESS",
        "mailProvider": "mail.tm",
        "mailRepresentation": MAILTM_ACCEPT,
        "checks": [],
    }
    _write_wrapper_report(report)

    mailbox: TemporaryMailbox | None = None
    result = 1
    cleanup_failed = False
    try:
        source = SOURCE_PATH.read_text(encoding="utf-8")
        if source.count(CREDENTIAL_ANCHOR) != 1:
            raise MailboxError("B9_BROWSER_EMAIL_CREDENTIAL_PATCH_SOURCE_MISMATCH")
        if source.count(AUTH_FLOW_ANCHOR) != 1:
            raise MailboxError("B9_BROWSER_EMAIL_AUTH_PATCH_SOURCE_MISMATCH")

        report["phase"] = "MAILBOX_PROVISION"
        _write_wrapper_report(report)
        mailbox = TemporaryMailbox.create()
        report["checks"].append("TEMPORARY_MAILBOX_PROVISIONED")

        patched = source.replace(CREDENTIAL_ANCHOR, CREDENTIAL_REPLACEMENT, 1)
        patched = patched.replace(AUTH_FLOW_ANCHOR, AUTH_FLOW_REPLACEMENT, 1)
        PATCHED_PATH.write_text(patched, encoding="utf-8")
        report["checks"].append("BROWSER_HARNESS_PATCHED_WITH_IN_MEMORY_CREDENTIALS")
        report["phase"] = "BROWSER_HARNESS"
        _write_wrapper_report(report)

        harness = runpy.run_path(
            str(PATCHED_PATH),
            run_name="cvengine_b9_browser",
            init_globals={
                "CERT_AUTH_EMAIL": mailbox.address,
                "CERT_AUTH_PASSWORD": mailbox.password,
                "CERT_AUTH_WAIT_FOR_CONFIRMATION": mailbox.wait_for_confirmation_url,
            },
        )
        result = int(harness["main"]())
        report["harnessExitCode"] = result
        if result == 0:
            report["status"] = "PASS"
            report["checks"].append("BROWSER_HARNESS_PASSED")
        else:
            report["errorCode"] = "B9_CERT_BROWSER_HARNESS_FAILED"
    except Exception as error:
        report["failedPhase"] = report["phase"]
        report["errorCode"] = _error_code(error)
        print(str(error), file=os.sys.stderr)
        result = 1
    finally:
        if mailbox is not None:
            try:
                mailbox.delete()
                report["checks"].append("TEMPORARY_MAILBOX_DELETED")
            except Exception:
                cleanup_failed = True
                report["failedPhase"] = "MAILBOX_CLEANUP"
                report["errorCode"] = "B9_CERT_MAILBOX_CLEANUP_FAILED"
                report["status"] = "FAIL"
                print("B9_CERT_MAILBOX_CLEANUP_FAILED", file=os.sys.stderr)
        if report["status"] == "PASS":
            report["phase"] = "COMPLETE"
        _write_wrapper_report(report)

    if cleanup_failed:
        return 1
    return result


if __name__ == "__main__":
    raise SystemExit(main())
