"use client";

import { useState } from "react";
import {
  AI_ACCESS_COPY,
  GeminiCredentialInputSchema,
  type AIAccessMode,
} from "../../domain/ai/AIAccess";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type AIAccessPanelProps = {
  platformGeminiAvailable: boolean;
  onReady: () => void;
};

const modes: AIAccessMode[] = ["PLATFORM_GEMINI", "BYOK_GEMINI", "NO_CLOUD_AI"];

export function AIAccessPanel({ platformGeminiAvailable, onReady }: AIAccessPanelProps) {
  const { mode, selectMode, setByokCredential, hasByokCredential } = useAIAccessSession();
  const [credentialInput, setCredentialInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function choose(nextMode: AIAccessMode) {
    if (nextMode === "PLATFORM_GEMINI" && !platformGeminiAvailable) {
      setError("CV Engine Gemini access is not configured in this runtime.");
      return;
    }

    setError(null);
    selectMode(nextMode);
    if (nextMode !== "BYOK_GEMINI") {
      setCredentialInput("");
    }
  }

  function storeByokCredential() {
    const parsed = GeminiCredentialInputSchema.safeParse(credentialInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid Gemini API key.");
      return;
    }

    setByokCredential(parsed.data);
    setCredentialInput("");
    setError(null);
  }

  const canContinue =
    mode === "NO_CLOUD_AI" ||
    (mode === "PLATFORM_GEMINI" && platformGeminiAvailable) ||
    (mode === "BYOK_GEMINI" && hasByokCredential);

  return (
    <section className="panel" aria-labelledby="ai-access-title">
      <p className="eyebrow">AI access</p>
      <h2 id="ai-access-title">Choose how CV Engine may use AI</h2>
      <p className="muted">
        Provider choice changes assistance availability and quota ownership. It never changes who
        owns your Career Evidence and never gives a model authority to create career truth.
      </p>

      <div className="choice-grid" role="radiogroup" aria-label="AI access mode">
        {modes.map((candidate) => {
          const copy = AI_ACCESS_COPY[candidate];
          const unavailable = candidate === "PLATFORM_GEMINI" && !platformGeminiAvailable;
          return (
            <button
              aria-checked={mode === candidate}
              className={`choice ${mode === candidate ? "selected" : ""}`}
              disabled={unavailable}
              key={candidate}
              role="radio"
              type="button"
              onClick={() => choose(candidate)}
            >
              <strong>{copy.title}</strong>
              <span>{copy.description}</span>
              {unavailable ? <small>Not configured in this runtime</small> : null}
            </button>
          );
        })}
      </div>

      {mode === "BYOK_GEMINI" ? (
        <div className="byok-box">
          <label>
            Gemini API key
            <input
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              type="password"
              value={credentialInput}
              onChange={(event) => setCredentialInput(event.target.value)}
            />
          </label>
          <button className="secondary" type="button" onClick={storeByokCredential}>
            {hasByokCredential ? "Replace session key" : "Use key for this session"}
          </button>
          <p className="fine-print">
            The raw key stays in browser memory only in this build. It is not written to local
            storage, cookies, URLs, Redis, PostgreSQL, logs, analytics, or consent metadata.
          </p>
        </div>
      ) : null}

      {error ? <p className="status error" role="alert">{error}</p> : null}

      <button className="primary" disabled={!canContinue} type="button" onClick={onReady}>
        Continue to CV Engine
      </button>
    </section>
  );
}
