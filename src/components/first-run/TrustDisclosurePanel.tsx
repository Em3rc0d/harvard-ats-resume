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
      <h1 id="trust-title">Your CV is your information.</h1>
      <p className="lead">
        CV Engine improves how your CV is written and organized. We do not sell,
        rent, or use the content of your CV for advertising, commercial profiling,
        or training our own models.
      </p>

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
          <h2>You choose who provides AI</h2>
          <p>Use your own Gemini, OpenAI, or Claude API key, or run a small AI model on your own computer.</p>
        </article>
        <article>
          <h2>Keys stay temporary</h2>
          <p>If you provide an API key, CV Engine keeps the raw key in browser memory for the current session and does not intentionally persist it.</p>
        </article>
        <article>
          <h2>Local AI uses your hardware</h2>
          <p>In Local AI mode, model inference runs in your browser using your CPU/GPU instead of CV Engine-paid inference infrastructure.</p>
        </article>
        <article>
          <h2>External providers have their own terms</h2>
          <p>If you choose a cloud provider, the CV content sent for that operation is also subject to that provider&apos;s privacy, retention, and billing terms.</p>
        </article>
      </div>

      <p className="fine-print">
        CV Engine may still store account and product data that is necessary to provide
        features you explicitly use. The statement above is not a claim that no data is
        ever stored; it is a restriction on commercial reuse of your CV content.
      </p>

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
