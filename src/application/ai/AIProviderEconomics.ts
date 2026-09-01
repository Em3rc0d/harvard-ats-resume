import type { AIExecutionBudget } from "../../domain/ai/AICapability";
import type { AICapabilityName, AIProviderAttemptPlan } from "./AIGatewayFoundation";

export const GEMINI_PRICING_CONTRACT_VERSION = "google-gemini-paid-standard-2026-09-01" as const;
export const GEMINI_PRICING_VALID_THROUGH = "2026-12-31" as const;

type GeminiPrice = Readonly<{
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}>;

const GEMINI_PRICES: Readonly<Record<string, GeminiPrice>> = {
  "gemini-3.5-flash-lite": {
    inputUsdPerMillionTokens: 0.30,
    outputUsdPerMillionTokens: 2.50,
  },
  "gemini-3.7-flash": {
    inputUsdPerMillionTokens: 0.75,
    outputUsdPerMillionTokens: 3.75,
  },
};

const CAPABILITY_COST_CAP_USD: Readonly<Record<AICapabilityName, number>> = {
  RESUME_IMPORT_FRAGMENT: 0.02,
  JOB_DESCRIPTION_INTERPRETATION: 0.04,
  OPPORTUNITY_EXPLANATION: 0.03,
  INLINE_WORDING_OPTIMIZATION: 0.005,
};

function dollars(tokens: number, usdPerMillion: number) {
  return (tokens / 1_000_000) * usdPerMillion;
}

export function geminiAttemptMaximumPaidCostUsd(model: string, budget: AIExecutionBudget): number | null {
  const price = GEMINI_PRICES[model];
  if (!price) return null;
  return dollars(budget.maxInputTokens, price.inputUsdPerMillionTokens)
    + dollars(budget.maxOutputTokens, price.outputUsdPerMillionTokens);
}

export function geminiActualPaidCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const price = GEMINI_PRICES[model];
  if (!price || inputTokens === null || outputTokens === null) return null;
  return dollars(inputTokens, price.inputUsdPerMillionTokens)
    + dollars(outputTokens, price.outputUsdPerMillionTokens);
}

export function plannedMaximumPaidCostUsd(plans: readonly AIProviderAttemptPlan[], budget: AIExecutionBudget): number {
  return plans.reduce((total, plan) => {
    if (plan.provider !== "GEMINI") return total;
    const estimate = geminiAttemptMaximumPaidCostUsd(plan.model, budget);
    if (estimate === null) return Number.POSITIVE_INFINITY;
    return total + estimate;
  }, 0);
}

export function getCapabilityPaidCostCapUsd(capability: AICapabilityName) {
  return CAPABILITY_COST_CAP_USD[capability];
}

export function assertProviderEconomicsWithinPolicy(
  capability: AICapabilityName,
  plans: readonly AIProviderAttemptPlan[],
  budget: AIExecutionBudget,
  at: Date = new Date(),
) {
  const validityEnd = new Date(`${GEMINI_PRICING_VALID_THROUGH}T23:59:59.999Z`);
  if (at.getTime() > validityEnd.getTime()) {
    throw new Error("GEMINI_PRICING_CONTRACT_EXPIRED");
  }
  const maximumPaidCostUsd = plannedMaximumPaidCostUsd(plans, budget);
  const capUsd = getCapabilityPaidCostCapUsd(capability);
  if (!Number.isFinite(maximumPaidCostUsd) || maximumPaidCostUsd > capUsd) {
    throw new Error("AI_COST_BUDGET_EXCEEDED");
  }
  return {
    pricingContractVersion: GEMINI_PRICING_CONTRACT_VERSION,
    pricingValidThrough: GEMINI_PRICING_VALID_THROUGH,
    maximumPaidCostUsd,
    capUsd,
  } as const;
}
