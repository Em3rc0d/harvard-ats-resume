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

RESUME_NAV_ANCHOR = '            page.get_by_role("button", name="Resume", exact=True).click()\n'
RESUME_NAV_REPLACEMENT = '            page.get_by_role("button", name="Legacy Resume Builder", exact=True).click()\n'


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
        RESUME_NAV_ANCHOR,
        RESUME_NAV_REPLACEMENT,
        "B9_SIMPLE_UX_RESUME_NAV_PATCH_MISMATCH",
    )
    SOURCE.write_text(source, encoding="utf-8")
    print("B9_SIMPLE_PRIMARY_UX_NAVIGATION_PATCHED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
