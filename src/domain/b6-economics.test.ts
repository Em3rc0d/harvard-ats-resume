import { describe, expect, it } from "vitest";
import { buildProviderAttemptPlan, type AICapabilityName } from "../application/ai/AIGatewayFoundation";
import { getAIExecutionBudget } from "../application/ai/AIGatewayRuntime";
import {
  assertProviderEconomicsWithinPolicy,
  geminiActualPaidCostUsd,
  GEMINI_PRICING_CONTRACT_VERSION,
  GEMINI_PRICING_VALID_THROUGH,
} from "../application/ai/AIProviderEconomics";

const capabilities: AICapabilityName[] = [
  "RESUME_IMPORT_FRAGMENT",
  "JOB_DESCRIPTION_INTERPRETATION",
  "OPPORTUNITY_EXPLANATION",
  "INLINE_WORDING_OPTIMIZATION",
];

describe("B6 AI economics", () => {
  it("keeps every cloud capability under its signed paid-cost ceiling", () => {
    for (const capability of capabilities) {
      const budget = getAIExecutionBudget(capability);
      const policy = assertProviderEconomicsWithinPolicy(
        capability,
        buildProviderAttemptPlan(capability, "PLATFORM_KEY"),
        budget,
        new Date("2026-09-01T12:00:00Z"),
      );
      expect(policy.maximumPaidCostUsd).toBeLessThanOrEqual(policy.capUsd);
      expect(policy.pricingContractVersion).toBe(GEMINI_PRICING_CONTRACT_VERSION);
      expect(policy.pricingValidThrough).toBe(GEMINI_PRICING_VALID_THROUGH);
    }
  });

  it("prices actual Gemini usage deterministically", () => {
    expect(geminiActualPaidCostUsd("gemini-3.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 8);
    expect(geminiActualPaidCostUsd("gemini-3.7-flash", 1_000_000, 1_000_000)).toBeCloseTo(4.5, 8);
  });

  it("fails closed when the signed pricing contract expires", () => {
    const capability = "OPPORTUNITY_EXPLANATION" as const;
    expect(() => assertProviderEconomicsWithinPolicy(
      capability,
      buildProviderAttemptPlan(capability, "PLATFORM_KEY"),
      getAIExecutionBudget(capability),
      new Date("2027-01-01T00:00:00Z"),
    )).toThrow("GEMINI_PRICING_CONTRACT_EXPIRED");
  });

  it("NO_CLOUD_AI has no paid Gemini route", () => {
    const capability = "OPPORTUNITY_EXPLANATION" as const;
    const policy = assertProviderEconomicsWithinPolicy(
      capability,
      buildProviderAttemptPlan(capability, "NO_CLOUD_AI"),
      getAIExecutionBudget(capability),
      new Date("2026-09-01T12:00:00Z"),
    );
    expect(policy.maximumPaidCostUsd).toBe(0);
  });
});
