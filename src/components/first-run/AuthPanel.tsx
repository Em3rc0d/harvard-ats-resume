"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../infrastructure/supabase/browser";

type AuthPanelProps = {
  authConfigured: boolean;
  onAuthenticated: () => void;
};

export function AuthPanel({ authConfigured, onAuthenticated }: AuthPanelProps) {
  const supabase = useMemo(
    () => (authConfigured ? createSupabaseBrowserClient() : null),
    [authConfigured],
  );
  const [mode, setMode] = useState<"SIGN_IN" | "SIGN_UP">("SIGN_IN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authConfigured || !supabase) {
    return (
      <section className="panel" aria-labelledby="auth-title">
        <p className="eyebrow">Account</p>
        <h2 id="auth-title">Authentication is not configured</h2>
        <p className="muted">
          Add the public Supabase URL and publishable key to enable durable CV Engine accounts.
          The trusted product will not create an anonymous server-side Career Vault.
        </p>
      </section>
    );
  }

  const client = supabase;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const result =
      mode === "SIGN_IN"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectTo },
          });

    setBusy(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    if (result.data.session) {
      setStatus("Authenticated.");
      onAuthenticated();
      return;
    }

    setStatus("Check your email to complete authentication, then return to CV Engine.");
  }

  async function sendMagicLink() {
    setBusy(true);
    setStatus(null);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setBusy(false);
    setStatus(error ? error.message : "Magic link sent. Check your email.");
  }

  return (
    <section className="panel" aria-labelledby="auth-title">
      <p className="eyebrow">Account</p>
      <h2 id="auth-title">{mode === "SIGN_IN" ? "Sign in" : "Create your account"}</h2>
      <p className="muted">
        Durable Career Evidence belongs to an authenticated user. Email is identity metadata, not
        the authorization rule; server identity and database ownership remain authoritative.
      </p>

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

      {status ? (
        <p className="status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
