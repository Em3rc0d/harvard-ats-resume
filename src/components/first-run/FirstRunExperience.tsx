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
  const { mode, selectMode, clearSessionSecrets, resetAIAccess } = useAIAccessSession();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!authConfigured) {
        if (!cancelled) {
          setAuthStatus(null);
          setStep("TRUST");
        }
        return;
      }

      setAuthStatus("Restoring secure account session…");
      const sessionResponse = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!sessionResponse?.ok) {
        setAuthStatus(null);
        setStep("TRUST");
        return;
      }

      setAuthStatus("Restoring consent and AI access preference…");
      const consentResponse = await fetch("/api/consent", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!consentResponse?.ok) {
        setAuthStatus("CV Engine could not restore your consent state. Review Trust before continuing.");
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
    if (!authConfigured) { setStep("AUTH"); return; }
    setAuthStatus("Verifying server session…");
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) { setAuthStatus(null); setStep("AUTH"); return; }
    if (!disclosureAcknowledged) { setAuthStatus(null); setStep("TRUST"); return; }
    setAuthStatus("Recording disclosure acknowledgement…");
    try { await persistConsent(); setAuthStatus(null); setStep("AI_ACCESS"); }
    catch { setAuthStatus("CV Engine could not record your disclosure acknowledgement. Try again."); }
  }

  async function acknowledgeDisclosure() {
    setDisclosureAcknowledged(true);
    if (!authConfigured) { setStep("AUTH"); return; }
    setAuthStatus("Checking account session…");
    const response = await fetch("/api/session", { cache: "no-store" });
    setAuthStatus(null);
    if (!response.ok) { setStep("AUTH"); return; }
    setAuthStatus("Recording disclosure acknowledgement…");
    try { await persistConsent(); setAuthStatus(null); setStep("AI_ACCESS"); }
    catch { setAuthStatus("CV Engine could not record your disclosure acknowledgement. Try again."); }
  }

  async function finalizeAIAccess(selectedMode: AIAccessMode) {
    await persistConsent(selectedMode);
    setStep("READY");
  }

  async function logout() {
    clearSessionSecrets(); resetAIAccess(); setDisclosureAcknowledged(false);
    if (authConfigured) { const supabase = createSupabaseBrowserClient(); await supabase.auth.signOut(); }
    setStep("TRUST");
  }

  if (step === "READY") return <CareerIntelligenceWorkspace aiAccessMode={mode} onSignOut={logout} />;

  return (
    <main className="first-run-shell">
      <header className="brand-bar"><div><span className="brand-mark">C</span><div><strong>CV Engine</strong><span>Career intelligence</span></div></div><span className="build-label">vNext · B8 RC</span></header>
      <div className="step-indicator" aria-label="First-run progress">
        <span className={step === "TRUST" ? "active" : step === "BOOTSTRAP" ? "" : "done"}>1 Trust</span>
        <span className={step === "AUTH" ? "active" : step === "TRUST" || step === "BOOTSTRAP" ? "" : "done"}>2 Account</span>
        <span className={step === "AI_ACCESS" ? "active" : ""}>3 AI access</span>
      </div>
      {step === "BOOTSTRAP" ? <section className="panel"><p className="muted">Restoring your durable CV Engine state…</p></section> : null}
      {step === "TRUST" ? <TrustDisclosurePanel onAcknowledge={acknowledgeDisclosure} /> : null}
      {step === "AUTH" ? <AuthPanel authConfigured={authConfigured} onAuthenticated={resolveAuthenticatedStep} /> : null}
      {step === "AI_ACCESS" ? <AIAccessPanel platformGeminiAvailable={platformGeminiAvailable} onReady={finalizeAIAccess} /> : null}
      {authStatus ? <p className="floating-status" role="status">{authStatus}</p> : null}
    </main>
  );
}
