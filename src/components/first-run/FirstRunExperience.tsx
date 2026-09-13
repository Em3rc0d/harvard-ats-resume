"use client";

import { useEffect, useState } from "react";
import { AIAccessModeSchema, type AIAccessMode } from "../../domain/ai/AIAccess";
import { createSupabaseBrowserClient } from "../../infrastructure/supabase/browser";
import { CareerIntelligenceWorkspace } from "../CareerIntelligenceWorkspace";
import { AIAccessPanel } from "./AIAccessPanel";
import { AuthPanel } from "./AuthPanel";
import { TrustDisclosurePanel } from "./TrustDisclosurePanel";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type Step = "BOOTSTRAP" | "TRUST" | "AUTH" | "AI_ACCESS" | "READY";
type FirstRunExperienceProps = { authConfigured: boolean; platformGeminiAvailable: boolean };

export function FirstRunExperience({ authConfigured, platformGeminiAvailable }: FirstRunExperienceProps) {
  const [step, setStep] = useState<Step>("BOOTSTRAP");
  const [authStatus, setAuthStatus] = useState<string | null>("Restoring CV Engine session…");
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);
  const [serverSessionVerified, setServerSessionVerified] = useState(false);
  const { mode, selectMode, clearSessionSecrets, resetAIAccess } = useAIAccessSession();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!authConfigured) {
        if (!cancelled) {
          setServerSessionVerified(false);
          setAuthStatus(null);
          setStep("TRUST");
        }
        return;
      }

      setAuthStatus("Restoring secure account session…");
      const sessionResponse = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!sessionResponse?.ok) {
        setServerSessionVerified(false);
        setAuthStatus(null);
        setStep("TRUST");
        return;
      }

      setServerSessionVerified(true);
      setAuthStatus("Restoring your preferences…");
      const consentResponse = await fetch("/api/consent", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!consentResponse?.ok) {
        setAuthStatus("We couldn’t restore your preferences. Review the safety notice to continue.");
        setStep("TRUST");
        return;
      }

      const consent = await consentResponse.json().catch(() => null);
      if (cancelled) return;
      if (consent?.acknowledged !== true) {
        setAuthStatus(null);
        setStep("TRUST");
        return;
      }

      setDisclosureAcknowledged(true);
      const parsedMode = AIAccessModeSchema.safeParse(consent?.aiAccessModePreference);
      if (!parsedMode.success) {
        setAuthStatus(null);
        setStep("AI_ACCESS");
        return;
      }

      const restoredMode = parsedMode.data;
      selectMode(restoredMode);
      setAuthStatus(null);

      if (restoredMode === "BYOK_GEMINI") {
        setStep("AI_ACCESS");
        return;
      }
      if (restoredMode === "PLATFORM_GEMINI" && !platformGeminiAvailable) {
        setStep("AI_ACCESS");
        return;
      }
      setStep("READY");
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authConfigured, platformGeminiAvailable, selectMode]);

  async function persistConsent(aiAccessModePreference?: AIAccessMode) {
    const response = await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(aiAccessModePreference ? { aiAccessModePreference } : {}) });
    if (!response.ok) throw new Error("CONSENT_PERSISTENCE_FAILED");
  }

  async function resolveAuthenticatedStep() {
    if (!authConfigured) {
      setServerSessionVerified(false);
      setStep("AUTH");
      return;
    }
    setAuthStatus("Verifying your account…");
    const response = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setServerSessionVerified(false);
      setAuthStatus(null);
      setStep("AUTH");
      return;
    }
    setServerSessionVerified(true);
    if (!disclosureAcknowledged) {
      setAuthStatus(null);
      setStep("TRUST");
      return;
    }
    setAuthStatus("Saving your preferences…");
    try {
      await persistConsent();
      setAuthStatus(null);
      setStep("AI_ACCESS");
    } catch {
      setAuthStatus("We couldn’t save your preferences. Try again.");
    }
  }

  async function acknowledgeDisclosure() {
    setDisclosureAcknowledged(true);

    // Bootstrap already verifies the server-side user before showing Trust to an
    // authenticated user. Repeating that network check here created a race right
    // after email confirmation. Consent persistence below is itself protected by
    // the same authoritative auth boundary, so no security check is bypassed.
    if (!serverSessionVerified) {
      setStep("AUTH");
      return;
    }

    setAuthStatus("Saving your preferences…");
    try {
      await persistConsent();
      setAuthStatus(null);
      setStep("AI_ACCESS");
    } catch {
      setAuthStatus("We couldn’t save your preferences. Try again.");
    }
  }

  async function finalizeAIAccess(selectedMode: AIAccessMode) {
    await persistConsent(selectedMode);
    setStep("READY");
  }

  async function logout() {
    clearSessionSecrets();
    resetAIAccess();
    setDisclosureAcknowledged(false);
    setServerSessionVerified(false);
    if (authConfigured) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }
    setStep("TRUST");
  }

  if (step === "READY") return <CareerIntelligenceWorkspace aiAccessMode={mode} onSignOut={logout} />;

  return (
    <main className="first-run-shell">
      <header className="brand-bar"><div><span className="brand-mark">C</span><div><strong>CV Engine</strong><span>Improve your CV without inventing facts</span></div></div><span className="build-label">vNext · B9</span></header>
      <div className="step-indicator" aria-label="First-run progress">
        <span className={step === "TRUST" ? "active" : step === "BOOTSTRAP" ? "" : "done"}>1 Safety</span>
        <span className={step === "AUTH" ? "active" : step === "TRUST" || step === "BOOTSTRAP" ? "" : "done"}>2 Account</span>
        <span className={step === "AI_ACCESS" ? "active" : ""}>3 AI</span>
      </div>
      {step === "BOOTSTRAP" ? <section className="panel"><p className="muted">Opening CV Engine…</p></section> : null}
      {step === "TRUST" ? <TrustDisclosurePanel onAcknowledge={acknowledgeDisclosure} /> : null}
      {step === "AUTH" ? <AuthPanel authConfigured={authConfigured} onAuthenticated={resolveAuthenticatedStep} /> : null}
      {step === "AI_ACCESS" ? <AIAccessPanel platformGeminiAvailable={platformGeminiAvailable} onReady={finalizeAIAccess} /> : null}
      {authStatus ? <p className="floating-status" role="status">{authStatus}</p> : null}
    </main>
  );
}
