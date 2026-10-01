"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AI_ACCESS_COPY,
  BYOKCredentialInputSchema,
  isByokTransportAllowed,
  type AIAccessMode,
} from "../../domain/ai/AIAccess";
import { detectLocalAIRuntime } from "../../application/ai/BrowserLocalAIRuntime";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type AIAccessPanelProps = { onReady: (mode: AIAccessMode) => void | Promise<void> };
type Path = "BYOK" | "LOCAL";
const providerModes = ["BYOK_GEMINI", "BYOK_OPENAI", "BYOK_ANTHROPIC"] as const satisfies readonly AIAccessMode[];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const noopSubscribe = () => () => undefined;

function useBrowserCapabilities() {
  const byokTransportAllowed = useSyncExternalStore(noopSubscribe, () => isByokTransportAllowed(window.location), () => false);
  const localHttpException = useSyncExternalStore(noopSubscribe, () =>
    isByokTransportAllowed(window.location) &&
    window.location.protocol === "http:" &&
    LOOPBACK_HOSTS.has(window.location.hostname.toLowerCase()), () => false);
  const localRuntime = useSyncExternalStore(noopSubscribe, detectLocalAIRuntime, () => ({
    webGpu: false, wasm: false, recommended: false, summary: "Checking browser capabilities…",
  }));
  return { byokTransportAllowed, localHttpException, localRuntime };
}

export function AIAccessPanel({ onReady }: AIAccessPanelProps) {
  const { mode, selectMode, setByokCredential, hasByokCredential } = useAIAccessSession();
  const [path, setPath] = useState<Path | null>(mode === "LOCAL_BROWSER" ? "LOCAL" : mode?.startsWith("BYOK_") ? "BYOK" : null);
  const [credentialInput, setCredentialInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { byokTransportAllowed, localHttpException, localRuntime } = useBrowserCapabilities();

  function choosePath(next: Path) {
    setPath(next);
    setError(null);
    if (next === "LOCAL") {
      selectMode("LOCAL_BROWSER");
      setCredentialInput("");
    } else if (!mode?.startsWith("BYOK_")) {
      selectMode("BYOK_GEMINI");
    }
  }

  function chooseProvider(nextMode: (typeof providerModes)[number]) {
    if (!byokTransportAllowed) {
      setError("Using your own AI key requires HTTPS outside local development.");
      return;
    }
    setError(null);
    selectMode(nextMode);
    setCredentialInput("");
  }

  function storeByokCredential() {
    if (!byokTransportAllowed) {
      setError("Using your own AI key requires HTTPS outside local development.");
      return;
    }
    const parsed = BYOKCredentialInputSchema.safeParse(credentialInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid API key.");
      return;
    }
    setByokCredential(parsed.data);
    setCredentialInput("");
    setError(null);
  }

  const byokSelected = mode?.startsWith("BYOK_") === true;
  const canContinue = mode === "LOCAL_BROWSER"
    ? localRuntime.wasm
    : byokSelected && byokTransportAllowed && hasByokCredential;

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
      <h2 id="ai-access-title">Choose who provides the AI compute</h2>
      <p className="muted">CV Engine does not sell your CV data or use its content for advertising or training its own models. AI output never gets authority to invent career facts.</p>

      <div className="choice-grid" role="radiogroup" aria-label="AI execution path">
        <button aria-checked={path === "BYOK"} className={`choice ${path === "BYOK" ? "selected" : ""}`} disabled={busy} role="radio" type="button" onClick={() => choosePath("BYOK")}>
          <strong>Use my AI provider</strong>
          <span>Bring your own API key. Choose Gemini, OpenAI, or Anthropic Claude.</span>
        </button>
        <button aria-checked={path === "LOCAL"} className={`choice ${path === "LOCAL" ? "selected" : ""}`} disabled={busy || !localRuntime.wasm} role="radio" type="button" onClick={() => choosePath("LOCAL")}>
          <strong>{AI_ACCESS_COPY.LOCAL_BROWSER.title}</strong>
          <span>{AI_ACCESS_COPY.LOCAL_BROWSER.description}</span>
          <small>{localRuntime.summary}</small>
        </button>
      </div>

      {path === "BYOK" ? (
        <div className="byok-box">
          <div className="split-actions" aria-label="AI provider">
            {providerModes.map((candidate) => (
              <button key={candidate} className={mode === candidate ? "primary" : "secondary"} type="button" disabled={busy || !byokTransportAllowed} onClick={() => chooseProvider(candidate)}>
                {candidate === "BYOK_GEMINI" ? "Gemini" : candidate === "BYOK_OPENAI" ? "OpenAI" : "Claude"}
              </button>
            ))}
          </div>
          <label>
            {mode === "BYOK_OPENAI" ? "OpenAI API key" : mode === "BYOK_ANTHROPIC" ? "Anthropic API key" : "Gemini API key"}
            <input autoCapitalize="off" autoComplete="off" disabled={busy || !byokTransportAllowed} spellCheck={false} type="password" value={credentialInput} onChange={(event) => setCredentialInput(event.target.value)} />
          </label>
          <button className="secondary" disabled={busy || !byokTransportAllowed} type="button" onClick={storeByokCredential}>
            {hasByokCredential ? "Replace session key" : "Use key for this session"}
          </button>
          <p className="fine-print">Your raw key stays in browser memory for this page session. CV Engine does not intentionally save it to your account, database, logs, analytics, cookies, URLs, or browser storage.</p>
          {localHttpException ? <p className="fine-print">Local HTTP is enabled only for development.</p> : null}
        </div>
      ) : null}

      {path === "LOCAL" ? (
        <div className="byok-box">
          <strong>Local AI privacy boundary</strong>
          <p className="fine-print">Model inference runs in this browser using your device. CV Engine will not use a platform-owned AI key for this mode. WebGPU is preferred; WASM/CPU is the fallback.</p>
          {!localRuntime.recommended && localRuntime.wasm ? <p className="fine-print">This device can continue, but generation may be noticeably slower without WebGPU.</p> : null}
        </div>
      ) : null}

      {error ? <p className="status error" role="alert">{error}</p> : null}
      <button className="primary" disabled={!canContinue || busy} type="button" onClick={continueToProduct}>
        {busy ? "Saving preference…" : "Continue to CV Engine"}
      </button>
    </section>
  );
}
