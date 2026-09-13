from __future__ import annotations

import sys
from pathlib import Path

ANCHOR = 'page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)'
REPLACEMENT = 'page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)'


def patch(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(ANCHOR)
    if count != 1:
        raise RuntimeError(f"BROWSER_NAVIGATION_READINESS_PATCH_MISMATCH:{path}:{count}")
    path.write_text(source.replace(ANCHOR, REPLACEMENT, 1), encoding="utf-8")
    print(f"BROWSER_NAVIGATION_READINESS_PATCHED:{path}")


def main() -> int:
    if len(sys.argv) < 2:
        raise RuntimeError("BROWSER_NAVIGATION_READINESS_PATCH_PATH_REQUIRED")
    for raw_path in sys.argv[1:]:
        patch(Path(raw_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
