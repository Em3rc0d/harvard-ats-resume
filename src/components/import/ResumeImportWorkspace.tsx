"use client";

import { useEffect, useState } from "react";
import type { ImportReceipt } from "../../domain/import/Import";

const kinds = ["EMPLOYMENT", "PROJECT", "ACHIEVEMENT", "EDUCATION", "CERTIFICATION", "SKILL", "LANGUAGE", "METRIC"] as const;
type CareerEvidenceKind = (typeof kinds)[number];

export function ResumeImportWorkspace() {
  const [imports, setImports] = useState<ImportReceipt[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [kindByProposal, setKindByProposal] = useState<Record<string, CareerEvidenceKind>>({});
  const [groupIdsByReceipt, setGroupIdsByReceipt] = useState<Record<string, string[]>>({});
  const [groupKindByReceipt, setGroupKindByReceipt] = useState<Record<string, CareerEvidenceKind>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/imports/resume", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) setError(body?.error ?? "IMPORT_LOAD_FAILED");
        else setImports(Array.isArray(body?.imports) ? body.imports : []);
      });
    return () => { cancelled = true; };
  }, []);

  function replaceReceipt(receipt: ImportReceipt) {
    setImports((current) => [receipt, ...current.filter((item) => item.id !== receipt.id)]);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/imports/resume", { method: "POST", body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "IMPORT_UPLOAD_FAILED");
    else replaceReceipt(body.receipt as ImportReceipt);
    setBusy(false);
  }

  function toggleGroupProposal(receiptId: string, proposalId: string) {
    setGroupIdsByReceipt((current) => {
      const selected = current[receiptId] ?? [];
      return {
        ...current,
        [receiptId]: selected.includes(proposalId)
          ? selected.filter((id) => id !== proposalId)
          : [...selected, proposalId],
      };
    });
  }

  async function acceptGroup(receipt: ImportReceipt) {
    const proposalIds = groupIdsByReceipt[receipt.id] ?? [];
    const kind = groupKindByReceipt[receipt.id];
    const selected = receipt.proposals
      .filter((proposal) => proposalIds.includes(proposal.id) && proposal.status === "PENDING")
      .sort((left, right) => left.sourceLine - right.sourceLine || left.ordinal - right.ordinal);
    const contiguous = selected.length >= 2 && selected.every((proposal, index) => index === 0 || proposal.sourceLine === selected[index - 1]!.sourceLine + 1);
    if (!kind) { setError("SELECT_EVIDENCE_KIND_REQUIRED"); return; }
    if (!contiguous) { setError("SELECT_CONTIGUOUS_IMPORT_LINES_REQUIRED"); return; }

    setBusy(true);
    setError(null);
    const response = await fetch("/api/imports/proposals/accept-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalIds: selected.map((proposal) => proposal.id), kind }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "IMPORT_PROPOSAL_GROUP_UPDATE_FAILED");
    else {
      replaceReceipt(body.receipt as ImportReceipt);
      setGroupIdsByReceipt((current) => ({ ...current, [receipt.id]: [] }));
    }
    setBusy(false);
  }

  async function resolveProposal(receiptId: string, proposalId: string, action: "accept" | "dismiss") {
    setError(null);
    const selectedKind = kindByProposal[proposalId];
    if (action === "accept" && !selectedKind) {
      setError("SELECT_EVIDENCE_KIND_REQUIRED");
      return;
    }

    setBusy(true);
    const init: RequestInit = { method: "POST" };
    if (action === "accept") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify({ kind: selectedKind });
    }
    const response = await fetch(`/api/imports/proposals/${proposalId}/${action}`, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "IMPORT_PROPOSAL_UPDATE_FAILED");
    else if (body.receipt) replaceReceipt(body.receipt as ImportReceipt);
    else {
      const refreshed = await fetch("/api/imports/resume", { cache: "no-store" }).then((result) => result.json());
      const receipt = (refreshed.imports as ImportReceipt[]).find((item) => item.id === receiptId);
      if (receipt) replaceReceipt(receipt);
    }
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="import-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Resume Import · Convenience, not truth</p>
        <h1 id="import-title">Extract review proposals from PDF or DOCX without auto-authoring Career Evidence.</h1>
        <p className="lead">Raw source bytes are request-scoped and are not persisted. Extraction is mechanical and bounded; unsupported/scanned/encrypted documents fall back to manual Career Evidence.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <label>Resume file
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="primary" type="button" disabled={!file || busy} onClick={() => void upload()}>Extract review proposals</button>
          <p className="muted">Maximum 5 MB. PDF support is deliberately limited to mechanically extractable selectable text; unsupported encodings/filters, encrypted files and scanned images do not silently pass.</p>
          <p className="muted">Every accepted proposal requires an explicit evidence type. CV Engine never defaults imported text to PROJECT or marks imported evidence VERIFIED.</p>
        </section>

        <section className="evidence-list" aria-live="polite">
          {imports.length === 0 ? <div className="panel empty-state"><h2>No imports yet.</h2><p className="muted">Import is optional. Manual Career Evidence remains the authoritative fallback.</p></div> : null}
          {imports.map((receipt) => {
            const pendingCount = receipt.proposals.filter((proposal) => proposal.status === "PENDING").length;
            const acceptedCount = receipt.proposals.filter((proposal) => proposal.status === "ACCEPTED").length;
            const dismissedCount = receipt.proposals.filter((proposal) => proposal.status === "DISMISSED").length;
            const selectedIds = groupIdsByReceipt[receipt.id] ?? [];
            const selected = receipt.proposals.filter((proposal) => selectedIds.includes(proposal.id) && proposal.status === "PENDING").sort((left, right) => left.sourceLine - right.sourceLine || left.ordinal - right.ordinal);
            const groupContiguous = selected.length >= 2 && selected.every((proposal, index) => index === 0 || proposal.sourceLine === selected[index - 1]!.sourceLine + 1);
            return <article className="panel evidence-card" key={receipt.id}>
              <div className="evidence-meta"><span>{receipt.mediaType}</span><span>{receipt.status}</span><span>{receipt.proposalCount} proposals</span></div>
              <h2>{receipt.sourceName}</h2>
              <p className="muted">Source SHA-256 {receipt.sourceSha256.slice(0, 12)}… · raw source not persisted</p>
              <p className="muted">Review state: {pendingCount} pending · {acceptedCount} accepted · {dismissedCount} dismissed.</p>
              {receipt.warningCode ? <p className="status">{receipt.warningCode} — use manual Career Evidence when extraction cannot be defended.</p> : null}
              {pendingCount >= 2 ? <div className="panel stack">
                <strong>Accept contiguous source lines as one evidence block</strong>
                <p className="muted">Use this for a project, job, education entry or other fact that spans several adjacent source lines. CV Engine concatenates the exact source wording in source-line order; blank-line gaps are treated as structural boundaries and are not crossed automatically.</p>
                <select aria-label={`Evidence kind for grouped proposals ${receipt.id}`} value={groupKindByReceipt[receipt.id] ?? ""} onChange={(event) => setGroupKindByReceipt((current) => ({ ...current, [receipt.id]: event.target.value as CareerEvidenceKind }))}>
                  <option value="" disabled>Select evidence type for block</option>
                  {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
                <button className="secondary" disabled={busy || !groupKindByReceipt[receipt.id] || !groupContiguous} type="button" onClick={() => void acceptGroup(receipt)}>Accept selected contiguous lines as one NEEDS_REVIEW item</button>
                {selected.length > 0 && !groupContiguous ? <p className="status error">Select at least two adjacent source lines without crossing a document gap.</p> : null}
              </div> : null}
              <div className="stack">
                {receipt.proposals.map((proposal) => <div key={proposal.id} className="panel">
                  <div className="evidence-meta"><span>Line {proposal.sourceLine}</span><span>{proposal.status}</span></div>
                  <p>{proposal.canonicalText}</p>
                  {proposal.status === "PENDING" ? <>
                    <label className="acknowledgement compact-check">
                      <input aria-label={`Select proposal ${proposal.ordinal} for grouped evidence`} type="checkbox" checked={selectedIds.includes(proposal.id)} onChange={() => toggleGroupProposal(receipt.id, proposal.id)} />
                      <span>Group with adjacent source lines</span>
                    </label>
                    <div className="split-actions">
                      <select aria-label={`Evidence kind for proposal ${proposal.ordinal}`} value={kindByProposal[proposal.id] ?? ""} onChange={(event) => setKindByProposal((current) => ({ ...current, [proposal.id]: event.target.value as CareerEvidenceKind }))}>
                        <option value="" disabled>Select evidence type</option>
                        {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                      </select>
                      <button className="primary" disabled={busy || !kindByProposal[proposal.id]} type="button" onClick={() => void resolveProposal(receipt.id, proposal.id, "accept")}>Accept as NEEDS_REVIEW</button>
                      <button className="secondary" disabled={busy} type="button" onClick={() => void resolveProposal(receipt.id, proposal.id, "dismiss")}>Dismiss</button>
                    </div>
                  </> : null}
                  {proposal.acceptedEvidenceId ? <p className="muted">Created Career Evidence {proposal.acceptedEvidenceId}. Review it in Career Evidence before marking VERIFIED.</p> : null}
                </div>)}
              </div>
            </article>;
          })}
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
