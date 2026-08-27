import { describe, expect, it } from "vitest";
import { TransientBYOKStore } from "../application/ai/TransientBYOKStore";
import { AIAccessPreferenceSchema } from "./ai/AIAccess";
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
});
