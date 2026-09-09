import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("B9 production browser navigation readiness", () => {
  it("uses DOM readiness plus semantic waits when reloading historical artifacts", () => {
    const script = read("tests/b9/production-browser-e2e.py");

    expect(script).toContain('page.reload(wait_until="domcontentloaded", timeout=30_000)');
    expect(script).not.toContain('page.reload(wait_until="networkidle"');
    expect(script).toContain('page.get_by_role("button", name="Resume", exact=True).wait_for(timeout=30_000)');
    expect(script).toContain('reloaded_card.wait_for(timeout=30_000)');
  });
});
