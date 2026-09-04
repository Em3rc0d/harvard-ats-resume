from __future__ import annotations

import runpy
from pathlib import Path

SOURCE_PATH = Path("tests/b9/production-browser-e2e.py")
PATCHED_PATH = Path("artifacts/b9-production-browser/patched-production-browser-e2e.py")

CONTEXT_ANCHOR = '''        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
'''

CONTEXT_REPLACEMENT = '''        # Playwright routing cannot see requests consumed by Service Workers.
        # Blocking them is certification-only and keeps Auth interception visible
        # without changing CV Engine or Supabase Production configuration.
        context = browser.new_context(accept_downloads=True, service_workers="block")
        page = context.new_page()
'''

AUTH_ANCHOR = '''        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)
'''

AUTH_REPLACEMENT = '''        try:
            # Certification only: preserve the real signup UI and Supabase client,
            # but turn its one Auth signup request into a disposable anonymous
            # signup. The trailing ** is intentional because Supabase appends a
            # redirect_to query string to /auth/v1/signup.
            anonymous_signup_intercepts = {"count": 0}

            def route_disposable_anonymous_signup(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                anonymous_signup_intercepts["count"] += 1
                route.continue_(post_data="{}")

            context.route("**/auth/v1/signup**", route_disposable_anonymous_signup)
            page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)
'''

AUTH_SUBMIT_ANCHOR = '''            page.get_by_role("button", name="Create account", exact=True).click()
            try:
'''

AUTH_SUBMIT_REPLACEMENT = '''            with page.expect_request("**/auth/v1/signup**", timeout=15_000):
                page.get_by_role("button", name="Create account", exact=True).click()
            if anonymous_signup_intercepts["count"] != 1:
                fail("B9_BROWSER_ANONYMOUS_AUTH_INTERCEPT_COUNT", str(anonymous_signup_intercepts["count"]))
            try:
'''

AUTH_FAILURE_ANCHOR = '''                if "Check your email" in statuses:
                    fail("B9_BROWSER_SIGNUP_REQUIRES_EMAIL_CONFIRMATION")
                fail("B9_BROWSER_AUTH_DID_NOT_ADVANCE", statuses)
'''

AUTH_FAILURE_REPLACEMENT = '''                if "Anonymous sign-ins are disabled" in statuses:
                    fail("B9_BROWSER_ANONYMOUS_AUTH_DISABLED")
                if "rate limit" in statuses.lower() or "too many requests" in statuses.lower():
                    fail("B9_BROWSER_ANONYMOUS_AUTH_RATE_LIMITED", statuses)
                if "Check your email" in statuses:
                    fail("B9_BROWSER_SIGNUP_REQUIRES_EMAIL_CONFIRMATION")
                fail("B9_BROWSER_AUTH_DID_NOT_ADVANCE", statuses)
'''


def main() -> int:
    source = SOURCE_PATH.read_text(encoding="utf-8")
    if source.count(CONTEXT_ANCHOR) != 1:
        raise SystemExit("B9_BROWSER_CONTEXT_PATCH_SOURCE_MISMATCH")
    if source.count(AUTH_ANCHOR) != 1:
        raise SystemExit("B9_BROWSER_AUTH_PATCH_SOURCE_MISMATCH")
    if source.count(AUTH_SUBMIT_ANCHOR) != 1:
        raise SystemExit("B9_BROWSER_AUTH_SUBMIT_PATCH_SOURCE_MISMATCH")
    if source.count(AUTH_FAILURE_ANCHOR) != 1:
        raise SystemExit("B9_BROWSER_AUTH_FAILURE_PATCH_SOURCE_MISMATCH")

    PATCHED_PATH.parent.mkdir(parents=True, exist_ok=True)
    patched = source.replace(CONTEXT_ANCHOR, CONTEXT_REPLACEMENT, 1)
    patched = patched.replace(AUTH_ANCHOR, AUTH_REPLACEMENT, 1)
    patched = patched.replace(AUTH_SUBMIT_ANCHOR, AUTH_SUBMIT_REPLACEMENT, 1)
    patched = patched.replace(AUTH_FAILURE_ANCHOR, AUTH_FAILURE_REPLACEMENT, 1)
    PATCHED_PATH.write_text(patched, encoding="utf-8")

    harness = runpy.run_path(str(PATCHED_PATH), run_name="cvengine_b9_browser")
    return int(harness["main"]())


if __name__ == "__main__":
    raise SystemExit(main())
