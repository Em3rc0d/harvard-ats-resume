"use client";

import { useState } from "react";

const DELETE_CONFIRMATION = "DELETE_MY_ACCOUNT";

function downloadJson(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cvengine-account-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AccountLifecycleWorkspace() {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"EXPORT" | "DELETE" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportAccount() {
    setBusy("EXPORT");
    setStatus(null);
    setError(null);
    const response = await fetch("/api/account/export", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "ACCOUNT_EXPORT_FAILED");
      setBusy(null);
      return;
    }
    downloadJson(body?.export ?? null);
    setStatus("Account export downloaded. The file contains the durable CV Engine records owned by this account.");
    setBusy(null);
  }

  async function deleteAccount() {
    if (confirmation !== DELETE_CONFIRMATION) {
      setError("TYPE_DELETE_MY_ACCOUNT_TO_CONFIRM");
      return;
    }
    if (!window.confirm("Permanently delete this CV Engine account and its durable data? This cannot be undone.")) return;

    setBusy("DELETE");
    setStatus(null);
    setError(null);
    const response = await fetch("/api/account/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: DELETE_CONFIRMATION }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.deleted !== true) {
      setError(body?.error ?? "ACCOUNT_DELETE_FAILED");
      setBusy(null);
      return;
    }

    setStatus("Account deleted. Returning to CV Engine start.");
    window.location.assign("/");
  }

  return (
    <section className="workspace" aria-labelledby="account-lifecycle-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Account · Data lifecycle</p>
        <h1 id="account-lifecycle-title">Export your durable data or permanently delete your account.</h1>
        <p className="lead">These actions are owner-bound on the server. CV Engine never accepts a user ID from the browser to choose whose account is exported or deleted.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <h2>Export account data</h2>
          <p className="muted">Download a JSON snapshot of the durable CV Engine records currently owned by your authenticated account.</p>
          <button className="secondary" disabled={busy !== null} type="button" onClick={() => void exportAccount()}>
            {busy === "EXPORT" ? "Preparing export…" : "Download my account data"}
          </button>
        </section>

        <section className="panel stack">
          <h2>Delete account permanently</h2>
          <p className="muted">Deletion removes the authenticated account and its CV Engine-owned durable records. This action cannot be undone.</p>
          <label>
            Type <strong>{DELETE_CONFIRMATION}</strong> to continue
            <input
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <button
            className="text-button danger-text"
            disabled={busy !== null || confirmation !== DELETE_CONFIRMATION}
            type="button"
            onClick={() => void deleteAccount()}
          >
            {busy === "DELETE" ? "Deleting account…" : "Permanently delete my account"}
          </button>
        </section>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
