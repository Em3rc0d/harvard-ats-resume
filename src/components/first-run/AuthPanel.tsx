"use client";

import { useState, type FormEvent } from "react";

type AuthPanelProps = {
  authConfigured: boolean;
  onAuthenticated: () => void;
};

type EmailAuthResponse = {
  authenticated?: boolean;
  confirmationRequired?: boolean;
  sent?: boolean;
  message?: string;
};

async function requestEmailAuth(body: Record<string, string>): Promise<{ ok: boolean; payload: EmailAuthResponse }> {
  try {
    const response = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as EmailAuthResponse;
    return { ok: response.ok, payload };
  } catch {
    return {
      ok: false,
      payload: { message: "CV Engine could not reach the authentication service. Please try again." },
    };
  }
}

export function AuthPanel({ authConfigured, onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<"SIGN_IN" | "SIGN_UP">("SIGN_IN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authConfigured) {
    return (
      <section className="panel" aria-labelledby="auth-title">
        <p className="eyebrow">Account</p>
        <h2 id="auth-title">Authentication is not configured</h2>
        <p className="muted">CV Engine needs account access to save your work securely.</p>
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    const { ok, payload } = await requestEmailAuth({ mode, email, password });
    setBusy(false);

    if (!ok) {
      setStatus(payload.message ?? "Authentication failed. Please try again.");
      return;
    }

    if (payload.authenticated) {
      setStatus("Signed in.");
      onAuthenticated();
      return;
    }

    if (payload.confirmationRequired) {
      setStatus("Check your email to confirm your account, then return to CV Engine.");
      return;
    }

    setStatus("CV Engine could not start your session. Please try again.");
  }

  async function sendMagicLink() {
    setBusy(true);
    setStatus(null);

    const { ok, payload } = await requestEmailAuth({ mode: "MAGIC_LINK", email });
    setBusy(false);
    setStatus(ok && payload.sent ? "Magic link sent. Check your email." : payload.message ?? "Could not send the magic link. Please try again.");
  }

  return (
    <section className="panel" aria-labelledby="auth-title">
      <p className="eyebrow">Account</p>
      <h2 id="auth-title">{mode === "SIGN_IN" ? "Sign in" : "Create your account"}</h2>
      <p className="muted">Sign in so your CV work, downloads, and preferences stay linked to your account.</p>

      <form className="stack" onSubmit={submit}>
        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete={mode === "SIGN_IN" ? "current-password" : "new-password"}
            minLength={8}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Working…" : mode === "SIGN_IN" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="split-actions">
        <button
          className="secondary"
          disabled={busy || !email}
          type="button"
          onClick={sendMagicLink}
        >
          Email me a magic link
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "SIGN_IN" ? "SIGN_UP" : "SIGN_IN");
            setStatus(null);
          }}
        >
          {mode === "SIGN_IN" ? "Create an account" : "I already have an account"}
        </button>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
