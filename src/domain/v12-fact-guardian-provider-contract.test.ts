import { describe, expect, it } from "vitest";
import { RESUME_FACT_GUARD_SCHEMA } from "../application/resume/FactGuardianService";

describe("v1.2 Fact Guardian provider contract", () => {
  it("asks the provider only for semantic classifications while CV Engine owns coverage and provenance", () => {
    const schema = RESUME_FACT_GUARD_SCHEMA as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties ?? {})).toEqual(["findings"]);

    const findings = (schema.properties?.findings ?? {}) as {
      items?: { properties?: Record<string, unknown> };
    };
    expect(Object.keys(findings.items?.properties ?? {}).sort()).toEqual([
      "classification",
      "generatedPath",
      "reasonCode",
    ]);
    expect(findings.items?.properties).not.toHaveProperty("sourceOrdinals");
    expect(schema.properties).not.toHaveProperty("reviewedPaths");
    expect(schema.properties).not.toHaveProperty("reviewedSourceOrdinals");
  });
});
