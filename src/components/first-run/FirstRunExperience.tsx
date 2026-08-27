"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../infrastructure/supabase/browser";
import { AIAccessPanel } from "./AIAccessPanel";
import { AuthPanel } from "./AuthPanel";
import { TrustDisclosurePanel } from "./TrustDisclosurePanel";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type Step = "TRUST" | "AUTH" | "AI_ACCESS" | "READY";

type FirstRunExperienceProps = {
  authConfigured: boolean;
  platformGeminiAvailable: boolean;
};

export function FirstRunExperience({
  authConfigured,
  platformGeminiAvailable,
}: FirstRunExperienceProps) {
  const [step, setStep] = useState<Step>("TRUST");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const { mode, clearSessionSecrets, resetAIAccess } = useAIAccessSession();

  async function resolveAuthenticatedStep() {
    if (!authConfigured) {
      setStep("AUTH");
      return;
    }

    setAuthStatus("Verifying server session…");
    const response = await fetch("/api/session", { cache: "no-store" });

    if (response.ok) {
      setAuthStatus(null);
      setStep("AI_ACCESS");
      return;
    }

    setAuthStatus(null);
    setStep("AUTH");
  }

  async function logout() {
    clearSessionSecrets();
    resetAIAccess();

    if (authConfigured) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }

    setStep("AUTH");
  }

  return (
    <main className="first-run-shell">
      <header className="brand-bar">
        <div>
          <span className="brand-mark">C</span>
          <div>
            <strong>CV Engine</strong>
            <span>Career intelligence</span>
          </div>
        </div>
        <span className="build-label">vNext · B0.5</span>
      </header>

      <div className="step-indicator" aria-label="First-run progress">
        <span className={step === "TRUST" ? "active" : "done"}>1 Trust</span>
        <span className={step === "AUTH" ? "active" : step === "TRUST" ? "" : "done"}>2 Account</span>
        <span className={step === "AI_ACCESS" ? "active" : step === "READY" ? "done" : ""}>3 AI access</span>
      </div>

      {step === "TRUST" ? (
        <TrustDisclosurePanel onAcknowledge={resolveAuthenticatedStep} />
      ) : null}

      {step === "AUTH" ? (
        <AuthPanel authConfigured={authConfigured} onAuthenticated={resolveAuthenticatedStep} />
      ) : null}

      {step === "AI_ACCESS" ? (
        <AIAccessPanel
          platformGeminiAvailable={platformGeminiAvailable}
          onReady={() => setStep("READY")}
        />
      ) : null}

      {step === "READY" ? (
        <section className="panel ready-panel" aria-labelledby="ready-title">
          <p className="eyebrow">Boundary ready</p>
          <h1 id="ready-title">Your trusted session is ready for Career Evidence.</h1>
          <p className="lead">
            AI access mode: <strong>{mode ?? "not selected"}</strong>. B1 will attach the durable
            Career Vault to the authenticated user and enforce ownership again in PostgreSQL RLS.
          </p>
          <div className="ready-contract">
            <span>Candidate truth → Career Evidence</span>
            <span>Market truth → Job Snapshot</span>
            <span>AI → bounded proposal</span>
            <span>ResumeVersion → deterministic projection</span>
          </div>
          <button className="secondary" type="button" onClick={logout}>
            Sign out and clear session secrets
          </button>
        </section>
      ) : null}

      {authStatus ? <p className="floating-status" role="status">{authStatus}</p> : null}
    </main>
  );
}
