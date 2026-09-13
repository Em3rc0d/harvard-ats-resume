import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("v1.2 first-run simplicity and auth continuity", () => {
  it("keeps the visible onboarding sequence short and task-oriented", () => {
    const source = read("src/components/first-run/FirstRunExperience.tsx");
    expect(source).toContain(">1 Safety<");
    expect(source).toContain(">2 Account<");
    expect(source).toContain(">3 AI<");
    expect(source).toContain("Improve your CV without inventing facts");
    expect(source).toContain("Opening CV Engine…");
  });

  it("does not re-check a server session after bootstrap already verified it", () => {
    const source = read("src/components/first-run/FirstRunExperience.tsx");
    expect(source).toContain("serverSessionVerified");
    expect(source).toContain("setServerSessionVerified(true)");
    expect(source).toContain("if (!serverSessionVerified)");

    const acknowledgeStart = source.indexOf("async function acknowledgeDisclosure()");
    const finalizeStart = source.indexOf("async function finalizeAIAccess", acknowledgeStart);
    const acknowledgeBody = source.slice(acknowledgeStart, finalizeStart);
    expect(acknowledgeBody).not.toContain('fetch("/api/session"');
    expect(acknowledgeBody).toContain("await persistConsent()");
  });

  it("still relies on a protected consent write before entering AI access", () => {
    const firstRun = read("src/components/first-run/FirstRunExperience.tsx");
    const consentRoute = read("src/app/api/consent/route.ts");
    expect(firstRun).toContain("await persistConsent()");
    expect(consentRoute).toContain("requireAuthenticatedSupabaseContext");
    expect(consentRoute).toContain("cv_engine_acknowledge_consent");
  });

  it("uses plain-language account, trust and AI explanations", () => {
    const auth = read("src/components/first-run/AuthPanel.tsx");
    const trust = read("src/components/first-run/TrustDisclosurePanel.tsx");
    const ai = read("src/components/first-run/AIAccessPanel.tsx");

    expect(auth).toContain("Sign in so your CV work, downloads, and preferences stay linked to your account.");
    expect(trust).toContain("Your facts stay yours");
    expect(trust).toContain("You review the result");
    expect(ai).toContain("AI never gets authority to invent facts about your career");
  });
});
