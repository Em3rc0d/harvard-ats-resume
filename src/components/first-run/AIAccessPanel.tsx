"use client";

import { useEffect, useState } from "react";
import {
  AI_ACCESS_COPY,
  ProviderCredentialInputSchema,
  USER_AI_PROVIDER_COPY,
  isByokTransportAllowed,
  type AIAccessMode,
  type UserAIProvider,
} from "../../domain/ai/AIAccess";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type AIAccessPanelProps = {
  onReady: (mode: AIAccessMode) => void | Promise<void>;
};

const publicModes: AIAccessMode[] = ["BYOK_GEMINI", "NO_CLOUD_AI"];
const providers: UserAIProvider[] = ["GEMINI", "OPENAI", "ANTHROPIC"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type LocalDeviceStatus = {
  checked: boolean;
  webgpu: boolean;
  hardwareConcurrency: number | null;
};

export function AIAccessPanel({ onReady }: AIAccessPanelProps) {
  const {
    mode,
    provider,
    selectMode,
    selectProvider,
    setByokCredential,
    hasByokCredential,
  } = useAIAccessSession();
  const [credentialInput, setCredentialInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [byokTransportAllowed, setByokTransportAllowed] = useState(false);
  const [localHttpException, setLocalHttpException] = useState(false);
  const [device, setDevice] = useState<LocalDeviceStatus>({
    checked: false,
    webgpu: false,
    hardwareConcurrency: null,
  });

  useEffect(() => {
    const allowed = isByokTransportAllowed(window.location);
    setByokTransportAllowed(allowed);
    setLocalHttpException(
      allowed &&
      window.location.protocol === "http:" &&
      LOOPBACK_HOSTS.has(window.location.hostname.toLowerCase()),
    );
    const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
    setDevice({
      checked: true,
      webgpu: Boolean(navigatorWithGpu.gpu),
      hardwareConcurrency:
        typeof navigator.hardwareConcurrency === "number"
          ? navigator.hardwareConcurrency
          : null,
    });
  }, []);

  function choose(nextMode: AIAccessMode) {
    if (nextMode === "BYOK_GEMINI" && !byokTransportAllowed) {
      setError("Using your own AI key requires HTTPS outside local development.");
      return;
    }
    setError(null);
    selectMode(nextMode);
    if (nextMode !== "BYOK_GEMINI") setCredentialInput("");
  }

  function chooseProvider(nextProvider: UserAIProvider) {
    selectProvider(nextProvider);
    setCredentialInput("");
    setError(null);
  }

  function storeByokCredential() {
    if (!byokTransportAllowed) {
      setError("Using your own AI key requires HTTPS outside local development.");
      return;
    }

    const parsed = ProviderCredentialInputSchema.safeParse(credentialInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid API key.");
      return;
    }

    setByokCredential(parsed.data);
    setCredentialInput("");
    setError(null);
  }

  const canContinue =
    mode === "NO_CLOUD_AI" ||
    (mode === "BYOK_GEMINI" && byokTransportAllowed && hasByokCredential);

  async function continueToProduct() {
    if (!mode || !canContinue) return;
    setBusy(true);
    setError(null);
    try {
      await onReady(mode);
    } catch {
      setError("We couldn’t save your AI preference. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="ai-access-title">
      <p className="eyebrow">AI access</p>
      <h2 id="ai-access-title">Choose who provides the compute</h2>
      <p className="muted">
        CV Engine does not require a CV Engine-paid AI plan. Use your own AI provider,
        or let a small model run on this device. AI never gets authority to invent
        facts about your career.
      </p>

      <div className="choice-grid choice-grid-two" role="radiogroup" aria-label="AI access mode">
        {publicModes.map((candidate) => {
          const copy = AI_ACCESS_COPY[candidate];
          const unavailable = candidate === "BYOK_GEMINI" && !byokTransportAllowed;
          return (
            <button
              aria-checked={mode === candidate}
              className={`choice ${mode === candidate ? "selected" : ""}`}
              disabled={unavailable || busy}
              key={candidate}
              role="radio"
              type="button"
              onClick={() => choose(candidate)}
            >
              <strong>{copy.title}</strong>
              <span>{copy.description}</span>
              {candidate === "BYOK_GEMINI" && !byokTransportAllowed ? (
                <small>HTTPS required outside localhost</small>
              ) : null}
              {candidate === "NO_CLOUD_AI" && device.checked ? (
                <small>
                  {device.webgpu
                    ? "WebGPU detected — your GPU can accelerate local inference."
                    : "WebGPU not detected — CV Engine will use a CPU/WASM fallback."}
                </small>
              ) : null}
            </button>
          );
        })}
      </div>

      {mode === "BYOK_GEMINI" ? (
        <div className="byok-box">
          <p className="eyebrow">Your provider</p>
          <div className="provider-grid" role="radiogroup" aria-label="AI provider">
            {providers.map((candidate) => (
              <button
                aria-checked={provider === candidate}
                className={`provider-choice ${provider === candidate ? "selected" : ""}`}
                disabled={busy}
                key={candidate}
                role="radio"
                type="button"
                onClick={() => chooseProvider(candidate)}
              >
                <strong>{USER_AI_PROVIDER_COPY[candidate].title}</strong>
                <span>{USER_AI_PROVIDER_COPY[candidate].description}</span>
              </button>
            ))}
          </div>

          <label>
            {USER_AI_PROVIDER_COPY[provider].keyLabel}
            <input
              autoCapitalize="off"
              autoComplete="off"
              disabled={busy || !byokTransportAllowed}
              spellCheck={false}
              type="password"
              value={credentialInput}
              onChange={(event) => setCredentialInput(event.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !byokTransportAllowed || credentialInput.trim().length === 0}
            type="button"
            onClick={storeByokCredential}
          >
            {hasByokCredential ? "Replace session key" : "Use key for this session"}
          </button>
          <p className="fine-print">
            Your raw key stays in browser memory for this session. CV Engine does not
            intentionally save it to your account, database, logs, analytics, cookies,
            URLs, or local storage. Requests made with the key are subject to the
            provider&apos;s own data and billing terms.
          </p>
          {localHttpException ? (
            <p className="fine-print">Local HTTP is enabled only for development.</p>
          ) : null}
        </div>
      ) : null}

      {mode === "NO_CLOUD_AI" ? (
        <div className="local-ai-box">
          <strong>Local AI uses this computer</strong>
          <p className="fine-print">
            The model is downloaded by your browser and inference runs on your own
            CPU/GPU. CV Engine does not spend Gemini/OpenAI/Claude tokens for this path.
            The first run can require a large model download and may be slower on older hardware.
          </p>
          {device.hardwareConcurrency ? (
            <p className="fine-print">Detected logical CPU threads: {device.hardwareConcurrency}.</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="status error" role="alert">{error}</p> : null}

      <button className="primary" disabled={!canContinue || busy} type="button" onClick={continueToProduct}>
        {busy ? "Saving preference…" : "Continue to CV Engine"}
      </button>
    </section>
  );
}
