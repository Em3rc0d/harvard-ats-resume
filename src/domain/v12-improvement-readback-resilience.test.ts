import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTransientImprovementReadErrorMessage } from "../application/resume/ResumeImprovementRunRepository";

describe("v1.2 improvement readback resilience", () => {
  it("retries only transient gateway/network failures", () => {
    expect(isTransientImprovementReadErrorMessage("Gateway Timeout")).toBe(true);
    expect(isTransientImprovementReadErrorMessage("upstream request timeout")).toBe(true);
    expect(isTransientImprovementReadErrorMessage("HTTP 504 from gateway")).toBe(true);
    expect(isTransientImprovementReadErrorMessage("fetch failed")).toBe(true);

    expect(isTransientImprovementReadErrorMessage("permission denied for table resume_improvement_runs")).toBe(false);
    expect(isTransientImprovementReadErrorMessage("invalid input syntax for type uuid")).toBe(false);
    expect(isTransientImprovementReadErrorMessage("row violates row-level security policy")).toBe(false);
  });

  it("keeps history lightweight and bounds full-run transient retries", () => {
    const source = readFileSync("src/application/resume/ResumeImprovementRunRepository.ts", "utf8");
    expect(source).not.toContain('.select("*")');
    expect(source).toContain('const SUMMARY_COLUMNS = "id,owner_user_id,source_receipt_id,status,created_at"');
    expect(source).toContain("const MAX_TRANSIENT_READ_ATTEMPTS = 3");
    expect(source).toContain("attempt === MAX_TRANSIENT_READ_ATTEMPTS");
  });
});
