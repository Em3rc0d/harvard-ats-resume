from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any

BASE_URL = os.environ.get(
    "CVENGINE_BASE_URL",
    "https://harvard-ats-resume.vercel.app",
).rstrip("/")
EXPECTED_SHA = os.environ.get("CVENGINE_EXPECTED_SHA", "").strip()
TIMEOUT_SECONDS = float(os.environ.get("CVENGINE_PREFLIGHT_TIMEOUT_SECONDS", "720"))
POLL_SECONDS = float(os.environ.get("CVENGINE_PREFLIGHT_POLL_SECONDS", "5"))


def get_json(url: str, timeout: float = 10.0) -> dict[str, Any] | None:
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "cvengine-b9-runtime-preflight"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8"))
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
    ):
        return None


def fail(code: str, detail: str | None = None) -> None:
    message = code if detail is None else f"{code}: {detail}"
    print(message, file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", EXPECTED_SHA):
        fail("B9_PREFLIGHT_EXPECTED_SHA_INVALID")
    if TIMEOUT_SECONDS <= 0 or POLL_SECONDS <= 0:
        fail("B9_PREFLIGHT_TIMING_INVALID")

    deadline = time.monotonic() + TIMEOUT_SECONDS
    last: dict[str, Any] | None = None

    while time.monotonic() < deadline:
        last = get_json(f"{BASE_URL}/api/build-info")
        if (
            last
            and last.get("gitCommitSha") == EXPECTED_SHA
            and last.get("environment") == "production"
        ):
            print("B9_PREFLIGHT_EXACT_RUNTIME_READY")
            print(
                json.dumps(
                    {
                        "gitCommitSha": last.get("gitCommitSha"),
                        "environment": last.get("environment"),
                    },
                    sort_keys=True,
                )
            )
            return
        time.sleep(POLL_SECONDS)

    detail = json.dumps(last, sort_keys=True) if last else "no build-info response"
    fail("B9_PREFLIGHT_EXACT_RUNTIME_NOT_READY", detail)


if __name__ == "__main__":
    main()
