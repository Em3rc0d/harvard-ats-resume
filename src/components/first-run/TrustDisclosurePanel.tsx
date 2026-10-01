"use client";

import { useState } from "react";
import { CURRENT_TRUST_DISCLOSURE, CURRENT_TRUST_DISCLOSURE_VERSION } from "../../domain/trust/FirstRunTrust";

export function TrustDisclosurePanel({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section className="panel" aria-labelledby="trust-title">
      <p className="eyebrow">Before you begin</p>
      <h1 id="trust-title">Your CV remains your information.</h1>
      <p className="lead">CV Engine does not sell, rent, or use the content of your CV for advertising, commercial profiling, or training CV Engine-owned models. We process and store only what is needed for the product features you choose and your account history.</p>

      <div className="trust-grid">
        <article><h2>Your facts stay yours</h2><p>Employers, roles, dates, skills, metrics, projects, responsibilities, and credentials must come from information you can defend as true.</p></article>
        <article><h2>You review the result</h2><p>AI can be incomplete or wrong. Review the final CV before sending it to an employer.</p></article>
        <article><h2>You choose the compute</h2><p>Use your own Gemini, OpenAI, or Anthropic API key, or let a compatible model run on your computer in the browser.</p></article>
        <article><h2>Provider keys stay temporary</h2><p>If you provide an API key, CV Engine uses it only for the active request/session flow and does not intentionally persist the raw key.</p></article>
      </div>

      <p className="fine-print">When you choose an external AI provider, the CV content needed for the requested AI operation is sent to that provider and is also subject to that provider&apos;s terms and privacy practices. Local AI avoids an external AI-provider request for inference.</p>

      <label className="acknowledgement">
        <input checked={confirmed} type="checkbox" onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I understand this disclosure and will review career/application content before using it.</span>
      </label>

      <div className="disclosure-version">
        Disclosure {CURRENT_TRUST_DISCLOSURE_VERSION} · truth boundary verified: {CURRENT_TRUST_DISCLOSURE.jobDescriptionCannotCreateCandidateTruth ? "yes" : "no"}
      </div>

      <button className="primary" disabled={!confirmed} type="button" onClick={onAcknowledge}>Acknowledge and continue</button>
    </section>
  );
}
