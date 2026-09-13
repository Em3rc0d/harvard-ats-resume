"use client";

import { useState } from "react";
import {
  CURRENT_TRUST_DISCLOSURE,
  CURRENT_TRUST_DISCLOSURE_VERSION,
} from "../../domain/trust/FirstRunTrust";

export function TrustDisclosurePanel({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className="panel" aria-labelledby="trust-title">
      <p className="eyebrow">Before you begin</p>
      <h1 id="trust-title">Your career evidence stays separate from AI suggestions.</h1>
      <p className="lead">CV Engine can improve how your CV is written and organized. It cannot turn a job description or AI suggestion into a fact about you.</p>

      <div className="trust-grid">
        <article>
          <h2>Your facts stay yours</h2>
          <p>Employers, roles, dates, skills, metrics, projects, responsibilities, and credentials must come from information you can defend as true.</p>
        </article>
        <article>
          <h2>You review the result</h2>
          <p>AI can be wrong. Review the final CV before sending it to an employer.</p>
        </article>
        <article>
          <h2>You choose AI access</h2>
          <p>You can use CV Engine&apos;s Gemini access, use your own Gemini key, or continue without cloud AI.</p>
        </article>
        <article>
          <h2>Your own key stays temporary</h2>
          <p>If you provide a Gemini key, CV Engine uses it only for the current session and does not intentionally save the raw key.</p>
        </article>
      </div>

      <label className="acknowledgement">
        <input checked={confirmed} type="checkbox" onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I understand this disclosure and will review career/application content before using it.</span>
      </label>

      <div className="disclosure-version">
        Disclosure {CURRENT_TRUST_DISCLOSURE_VERSION} · truth boundary verified:{" "}
        {CURRENT_TRUST_DISCLOSURE.jobDescriptionCannotCreateCandidateTruth ? "yes" : "no"}
      </div>

      <button className="primary" disabled={!confirmed} type="button" onClick={onAcknowledge}>
        Acknowledge and continue
      </button>
    </section>
  );
}
