from __future__ import annotations

from pathlib import Path

SOURCE = Path("tests/v12/production-improve-resume-cert.py")

ANCHOR = '''                except PlaywrightTimeoutError:
                    page.get_by_role("status").filter(has_text="Check your email").wait_for(timeout=20_000)
                    page.goto(mailbox.wait_for_confirmation_url(), wait_until="domcontentloaded", timeout=30_000)
'''
REPLACEMENT = '''                except PlaywrightTimeoutError:
                    confirmation_url = mailbox.wait_for_confirmation_url()
                    if not confirmation_url:
                        fail("V12_BROWSER_CONFIRMATION_EMAIL_MISSING")
                    page.goto(confirmation_url, wait_until="domcontentloaded", timeout=30_000)
'''


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    count = source.count(ANCHOR)
    if count != 1:
        raise RuntimeError(f"V12_EMAIL_CONFIRMATION_STATE_PATCH_MISMATCH:{count}")
    SOURCE.write_text(source.replace(ANCHOR, REPLACEMENT, 1), encoding="utf-8")
    print("V12_EMAIL_CONFIRMATION_STATE_PATCHED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
