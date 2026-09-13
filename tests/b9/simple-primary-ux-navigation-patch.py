from __future__ import annotations

from pathlib import Path

SOURCE = Path("tests/b9/production-browser-e2e.py")

LANDING_ANCHOR = '''            page.get_by_role("heading", name="Build the career evidence you can defend.").wait_for(timeout=30_000)
            report["checks"].append("PLATFORM_AI_SELECTED")

            page.get_by_role("button", name="Resume Import", exact=True).click()
'''
LANDING_REPLACEMENT = '''            page.get_by_role("heading", name="Improve your resume").wait_for(timeout=30_000)
            report["checks"].append("PLATFORM_AI_SELECTED")
            report["checks"].append("SIMPLE_PRIMARY_IMPROVE_RESUME_LANDING")

            page.get_by_role("button", name="Advanced tools", exact=True).click()
            page.get_by_role("button", name="Resume Import", exact=True).click()
'''

FIRST_RESUME_NAV_ANCHOR = '''            report["checks"].append("CAREER_TARGET_ACTIVE")

            page.get_by_role("button", name="Resume", exact=True).click()
            page.get_by_role("heading", name="Turn verified career truth into a professional, provenance-backed resume.").wait_for(timeout=30_000)
'''
FIRST_RESUME_NAV_REPLACEMENT = '''            report["checks"].append("CAREER_TARGET_ACTIVE")

            page.get_by_role("button", name="Legacy Resume Builder", exact=True).click()
            page.get_by_role("heading", name="Turn verified career truth into a professional, provenance-backed resume.").wait_for(timeout=30_000)
'''

RELOAD_RESUME_NAV_ANCHOR = '''            page.reload(wait_until="domcontentloaded", timeout=30_000)
            page.get_by_role("button", name="Resume", exact=True).wait_for(timeout=30_000)
            page.get_by_role("button", name="Resume", exact=True).click()
            reloaded_card = page.locator("article.evidence-card").filter(has_text=CANDIDATE_NAME).first
'''
RELOAD_RESUME_NAV_REPLACEMENT = '''            page.reload(wait_until="domcontentloaded", timeout=30_000)
            page.get_by_role("button", name="Advanced tools", exact=True).wait_for(timeout=30_000)
            page.get_by_role("button", name="Advanced tools", exact=True).click()
            page.get_by_role("button", name="Legacy Resume Builder", exact=True).wait_for(timeout=30_000)
            page.get_by_role("button", name="Legacy Resume Builder", exact=True).click()
            reloaded_card = page.locator("article.evidence-card").filter(has_text=CANDIDATE_NAME).first
'''


def replace_exactly_once(source: str, anchor: str, replacement: str, code: str) -> str:
    count = source.count(anchor)
    if count != 1:
        raise RuntimeError(f"{code}:{count}")
    return source.replace(anchor, replacement, 1)


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    source = replace_exactly_once(
        source,
        LANDING_ANCHOR,
        LANDING_REPLACEMENT,
        "B9_SIMPLE_UX_LANDING_PATCH_MISMATCH",
    )
    source = replace_exactly_once(
        source,
        FIRST_RESUME_NAV_ANCHOR,
        FIRST_RESUME_NAV_REPLACEMENT,
        "B9_SIMPLE_UX_FIRST_RESUME_NAV_PATCH_MISMATCH",
    )
    source = replace_exactly_once(
        source,
        RELOAD_RESUME_NAV_ANCHOR,
        RELOAD_RESUME_NAV_REPLACEMENT,
        "B9_SIMPLE_UX_RELOAD_RESUME_NAV_PATCH_MISMATCH",
    )
    SOURCE.write_text(source, encoding="utf-8")
    print("B9_SIMPLE_PRIMARY_UX_NAVIGATION_PATCHED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
