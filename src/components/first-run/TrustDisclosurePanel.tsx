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
      <p className="lead">
        CV Engine helps you structure career evidence, understand opportunities, and build
        evidence-backed resume versions. It does not guarantee hiring outcomes, and AI output can
        be incomplete or wrong.
      </p>

      <div className="trust-grid">
        <article>
          <h2>Career truth</h2>
          <p>
            A Job Description cannot create a skill, responsibility, metric, project, date,
            seniority level, employer, or credential in your Career Evidence.
          </p>
        </article>
        <article>
          <h2>Review required</h2>
          <p>
            You remain responsible for reviewing what you submit to an employer. CV Engine may
            recommend wording or identify gaps; recommendations are not facts.
          </p>
        </article>
        <article>
          <h2>Cloud AI is a choice</h2>
          <p>
            You can use CV Engine&apos;s Gemini access, bring your own Gemini key, or continue without
            cloud AI. Bounded content may be processed by the selected provider.
          </p>
        </article>
        <article>
          <h2>BYOK is transient</h2>
          <p>
            A user-supplied Gemini key is session/request context, not Career Vault data. The raw
            credential is not intentionally persisted.
          </p>
        </article>
      </div>

      <label className="acknowledgement">
        <input
          checked={confirmed}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          I understand this disclosure and will review career/application content before using it.
        </span>
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
