"use client";

import { useEffect, useMemo, useState } from "react";
import type { AIAccessMode } from "../../domain/ai/AIAccess";
import type { CareerEvidenceCurrent } from "../../domain/career/CareerEvidenceMutation";
import type { z } from "zod";
import { CareerEvidenceKindSchema } from "../../domain/career/CareerEvidence";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

type CareerEvidenceKind = z.infer<typeof CareerEvidenceKindSchema>;

const KINDS: ReadonlyArray<{ value: CareerEvidenceKind; label: string }> = [
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "PROJECT", label: "Project" },
  { value: "ACHIEVEMENT", label: "Achievement" },
  { value: "EDUCATION", label: "Education" },
  { value: "CERTIFICATION", label: "Certification" },
  { value: "SKILL", label: "Skill evidence" },
  { value: "LANGUAGE", label: "Language" },
  { value: "METRIC", label: "Defensible metric" },
];

const WORDING_OBJECTIVE =
  "Improve clarity, concision, and professional phrasing while preserving the source meaning exactly.";

type CareerEvidenceWorkspaceProps = {
  aiAccessMode: AIAccessMode | null;
  onSignOut: () => Promise<void>;
};

export function CareerEvidenceWorkspace({ aiAccessMode, onSignOut }: CareerEvidenceWorkspaceProps) {
  const { readByokCredential } = useAIAccessSession();
  const [evidence, setEvidence] = useState<CareerEvidenceCurrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<CareerEvidenceKind | "">("");
  const [canonicalText, setCanonicalText] = useState("");
  const [verified, setVerified] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editVerified, setEditVerified] = useState(false);
  const [presentationNotices, setPresentationNotices] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadInitialEvidence() {
      const response = await fetch("/api/career/evidence", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (cancelled) return;

      if (!response.ok) {
        setError(body?.error ?? "CAREER_EVIDENCE_LOAD_FAILED");
        setLoading(false);
        return;
      }

      setEvidence(Array.isArray(body?.evidence) ? body.evidence : []);
      setLoading(false);
    }

    void loadInitialEvidence();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const verifiedCount = evidence.filter((item) => item.verificationStatus === "VERIFIED").length;
    return { total: evidence.length, verified: verifiedCount };
  }, [evidence]);

  const aiWordingEnabled =
    aiAccessMode === "PLATFORM_GEMINI" || aiAccessMode === "BYOK_GEMINI";

  async function createEvidence() {
    if (!kind || !canonicalText.trim()) {
      setError(!kind ? "SELECT_EVIDENCE_KIND_REQUIRED" : null);
      return;
    }
    setBusy(true);
    setError(null);

    const response = await fetch("/api/career/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        canonicalText,
        verificationStatus: verified ? "VERIFIED" : "UNVERIFIED",
      }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setError(body?.error ?? "CAREER_EVIDENCE_CREATE_FAILED");
      setBusy(false);
      return;
    }

    setEvidence((current) => [body.evidence, ...current]);
    setKind("");
    setCanonicalText("");
    setVerified(false);
    setBusy(false);
  }

  function beginEdit(item: CareerEvidenceCurrent) {
    setEditingId(item.id);
    setEditText(item.canonicalText);
    setEditVerified(item.verificationStatus === "VERIFIED");
    setError(null);
  }

  async function saveRevision(item: CareerEvidenceCurrent) {
    if (!editText.trim()) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/career/evidence/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: item.revision,
        canonicalText: editText,
        verificationStatus: editVerified ? "VERIFIED" : "UNVERIFIED",
      }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setError(body?.error ?? "CAREER_EVIDENCE_REVISION_FAILED");
      setBusy(false);
      return;
    }

    setEvidence((current) =>
      current.map((candidate) => (candidate.id === item.id ? body.evidence : candidate)),
    );
    setPresentationNotices((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setEditingId(null);
    setEditText("");
    setBusy(false);
  }

  async function improveWording(item: CareerEvidenceCurrent) {
    setBusy(true);
    setError(null);
    setPresentationNotices((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (aiAccessMode === "BYOK_GEMINI") {
      const credential = readByokCredential();
      if (!credential) {
        setError("BYOK_CREDENTIAL_REQUIRED");
        setBusy(false);
        return;
      }
      headers["x-cvengine-byok-key"] = credential;
    }

    const response = await fetch(`/api/presentation/evidence/${item.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ objective: WORDING_OBJECTIVE }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (
        response.status === 422
        && Array.isArray(body?.validation?.reasonCodes)
      ) {
        setPresentationNotices((current) => ({
          ...current,
          [item.id]: `Suggestion rejected by fact-preservation checks: ${body.validation.reasonCodes.join(", ")}.`,
        }));
      } else {
        setError(body?.error ?? "PRESENTATION_PROPOSAL_FAILED");
      }
      setBusy(false);
      return;
    }

    setPresentationNotices((current) => ({
      ...current,
      [item.id]: "Validated wording suggestion ready for review.",
    }));
    setBusy(false);
  }

  async function removeEvidence(item: CareerEvidenceCurrent) {
    if (!window.confirm("Delete this evidence item and its revision history?")) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/career/evidence/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "CAREER_EVIDENCE_DELETE_FAILED");
      setBusy(false);
      return;
    }

    setEvidence((current) => current.filter((candidate) => candidate.id !== item.id));
    setPresentationNotices((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="career-evidence-title">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Career Vault · B1</p>
          <h1 id="career-evidence-title">Build the career evidence you can defend.</h1>
          <p className="lead">
            Manual evidence is candidate truth input. Editing creates a new revision instead of
            rewriting history. Job descriptions never enter this collection.
          </p>
        </div>
        <div className="workspace-actions">
          <span className="build-label">AI: {aiAccessMode ?? "not selected"}</span>
          <button className="text-button" type="button" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="evidence-summary" aria-label="Career evidence summary">
        <div><strong>{counts.total}</strong><span>Evidence items</span></div>
        <div><strong>{counts.verified}</strong><span>Marked defensible</span></div>
        <div><strong>{counts.total - counts.verified}</strong><span>Needs review</span></div>
      </div>

      <div className="workspace-grid">
        <section className="panel evidence-composer" aria-labelledby="add-evidence-title">
          <p className="eyebrow">Add evidence</p>
          <h2 id="add-evidence-title">What have you actually done?</h2>

          <label>
            Evidence type
            <select value={kind} onChange={(event) => setKind(event.target.value as CareerEvidenceKind | "")}>
              <option value="" disabled>Select evidence type</option>
              {KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label>
            Evidence statement
            <textarea
              maxLength={10_000}
              placeholder="Example: Built a telemetry ingestion API for vehicle diagnostics."
              rows={6}
              value={canonicalText}
              onChange={(event) => setCanonicalText(event.target.value)}
            />
          </label>

          <label className="acknowledgement compact-check">
            <input checked={verified} type="checkbox" onChange={(event) => setVerified(event.target.checked)} />
            <span>I can defend this statement as true.</span>
          </label>

          <button className="primary" disabled={busy || !kind || !canonicalText.trim()} type="button" onClick={createEvidence}>
            Save Career Evidence
          </button>
        </section>

        <section className="evidence-list" aria-live="polite">
          {loading ? <div className="panel"><p className="muted">Loading durable Career Evidence…</p></div> : null}
          {!loading && evidence.length === 0 ? (
            <div className="panel empty-state">
              <p className="eyebrow">Career Vault</p>
              <h2>No evidence yet.</h2>
              <p className="muted">Start manually or import a resume for review. Neither path silently invents a truth category.</p>
            </div>
          ) : null}

          {evidence.map((item) => (
            <article className="panel evidence-card" key={item.id}>
              <div className="evidence-meta">
                <span>{KINDS.find((kindItem) => kindItem.value === item.kind)?.label ?? item.kind}</span>
                <span>Revision {item.revision}</span>
                <span className={item.verificationStatus === "VERIFIED" ? "verified" : "review"}>
                  {item.verificationStatus === "VERIFIED" ? "Defensible" : "Needs review"}
                </span>
              </div>

              {editingId === item.id ? (
                <div className="stack">
                  <textarea rows={5} maxLength={10_000} value={editText} onChange={(event) => setEditText(event.target.value)} />
                  <label className="acknowledgement compact-check">
                    <input checked={editVerified} type="checkbox" onChange={(event) => setEditVerified(event.target.checked)} />
                    <span>I can defend this revised statement as true.</span>
                  </label>
                  <div className="split-actions">
                    <button className="primary" disabled={busy} type="button" onClick={() => void saveRevision(item)}>Save revision</button>
                    <button className="secondary" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="evidence-text">{item.canonicalText}</p>
              )}

              {editingId !== item.id ? (
                <div className="split-actions">
                  <button className="secondary" disabled={busy} type="button" onClick={() => beginEdit(item)}>Edit as new revision</button>
                  {item.verificationStatus === "VERIFIED" && aiWordingEnabled ? (
                    <button className="secondary" disabled={busy} type="button" onClick={() => void improveWording(item)}>
                      Improve wording
                    </button>
                  ) : null}
                  <button className="text-button danger-text" disabled={busy} type="button" onClick={() => void removeEvidence(item)}>Delete</button>
                </div>
              ) : null}

              {presentationNotices[item.id] ? (
                <p className="status" role="status">{presentationNotices[item.id]}</p>
              ) : null}
            </article>
          ))}
        </section>
      </div>

      {error ? <p className="status error workspace-error" role="alert">{error}</p> : null}
    </section>
  );
}
