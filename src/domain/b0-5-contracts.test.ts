import { describe, expect, it } from "vitest";
import { TransientBYOKStore } from "../application/ai/TransientBYOKStore";
import {
  buildProviderAttemptPlan,
  getModelRoute,
} from "../application/ai/AIGatewayFoundation";
import {
  AIAccessPreferenceSchema,
  isByokTransportAllowed,
} from "./ai/AIAccess";
import {
  ConsentReceiptSchema,
  CURRENT_TRUST_DISCLOSURE,
  CURRENT_TRUST_DISCLOSURE_VERSION,
} from "./trust/FirstRunTrust";

const ownerUserId = "00000000-0000-4000-8000-000000000101";
const plausibleKey = "gemini-session-key-example-1234567890";

describe("B0.5 trust and AI access contracts", () => {
  it("freezes the required disclosure semantics", () => {
    expect(CURRENT_TRUST_DISCLOSURE).toEqual({
      version: CURRENT_TRUST_DISCLOSURE_VERSION,
      aiCanBeWrong: true,
      userReviewRequired: true,
      jobDescriptionCannotCreateCandidateTruth: true,
      cloudProcessingDisclosed: true,
      byokIsTransient: true,
    });
  });

  it("rejects stale consent receipts", () => {
    const result = ConsentReceiptSchema.safeParse({
      ownerUserId,
      disclosureVersion: "cv-engine-trust-v0",
      acknowledgedAt: "2026-08-27T14:00:00.000Z",
      aiAccessModePreference: "NO_CLOUD_AI",
    });

    expect(result.success).toBe(false);
  });

  it("makes a raw BYOK key invalid durable AI preference data", () => {
    const result = AIAccessPreferenceSchema.safeParse({
      mode: "BYOK_GEMINI",
      apiKey: plausibleKey,
    });

    expect(result.success).toBe(false);
  });

  it("keeps BYOK non-enumerable and removes it when cleared", () => {
    const store = new TransientBYOKStore();
    store.set(plausibleKey);

    expect(store.hasCredential()).toBe(true);
    expect(store.read()).toBe(plausibleKey);
    expect(JSON.stringify(store)).toBe("{}");

    store.clear();

    expect(store.hasCredential()).toBe(false);
    expect(store.read()).toBeNull();
    expect(JSON.stringify(store)).not.toContain(plausibleKey);
  });

  it("permits BYOK only over HTTPS or explicit loopback HTTP development", () => {
    expect(isByokTransportAllowed({ protocol: "https:", hostname: "cvengine.example" })).toBe(true);
    expect(isByokTransportAllowed({ protocol: "http:", hostname: "localhost" })).toBe(true);
    expect(isByokTransportAllowed({ protocol: "http:", hostname: "127.0.0.1" })).toBe(true);
    expect(isByokTransportAllowed({ protocol: "http:", hostname: "::1" })).toBe(true);
    expect(isByokTransportAllowed({ protocol: "http:", hostname: "cvengine.example" })).toBe(false);
    expect(isByokTransportAllowed({ protocol: "ftp:", hostname: "localhost" })).toBe(false);
  });

  it("freezes the vNext capability-specific model routing baseline", () => {
    expect(getModelRoute("RESUME_IMPORT_FRAGMENT").geminiModels).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.7-flash",
    ]);
    expect(getModelRoute("INLINE_WORDING_OPTIMIZATION").geminiModels).toEqual([
      "gemini-3.5-flash-lite",
    ]);
  });

  it("skips Gemini completely in no-cloud mode while preserving local fallback", () => {
    const plan = buildProviderAttemptPlan("JOB_DESCRIPTION_INTERPRETATION", "NO_CLOUD_AI");
    expect(plan.some((attempt) => attempt.provider === "GEMINI")).toBe(false);
    expect(plan).toEqual([
      {
        provider: "OLLAMA",
        model: "cv-engine-analysis",
        credentialMode: "NO_CLOUD_AI",
      },
    ]);
  });

  it("routes cloud-enabled modes through Gemini before Ollama", () => {
    const plan = buildProviderAttemptPlan("RESUME_IMPORT_FRAGMENT", "PLATFORM_KEY");
    expect(plan.map((attempt) => attempt.provider)).toEqual(["GEMINI", "GEMINI", "OLLAMA"]);
    expect(plan[0]?.model).toBe("gemini-3.5-flash-lite");
    expect(plan.at(-1)?.credentialMode).toBe("NO_CLOUD_AI");
  });
});
