"use client";

import { useEffect, useState } from "react";
import type { ImportProposal, ImportReceipt } from "../../domain/import/Import";
import {
  isCareerEvidenceReviewKind,
  type ImportReviewBlock,
} from "../../domain/import/ImportReview";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

const kinds = ["EMPLOYMENT", "PROJECT", "ACHIEVEMENT", "EDUCATION", "CERTIFICATION", "SKILL", "LANGUAGE", "METRIC"] as const;
type CareerEvidenceKind = (typeof kinds)[number];

function proposalsForBlock(receipt: ImportReceipt, block: ImportReviewBlock) {
  const ordinals = new Set(block.sourceOrdinals);
  return receipt.proposals
    .filter((proposal) => ordinals.has(proposal.ordinal))
    .sort((left, right) => left.sourceLine - right.sourceLine || left.ordinal - right.ordinal);
}

function blockResolution(receipt: ImportReceipt, block: ImportReviewBlock) {
  const proposals = proposalsForBlock(receipt, block);
  if (proposals.length === 0) return "EMPTY" as const;
  const statuses = new Set(proposals.map((proposal) => proposal.status));
  if (statuses.size === 1 && statuses.has("ACCEPTED")) return "ACCEPTED" as const;
  if (statuses.size === 1 && statuses.has("DISMISSED")) return "DISMISSED" as const;
  if (statuses.has("PENDING")) return "PENDING" as const;
  return "MIXED" as const;
}

function blockText(receipt: ImportReceipt, block: ImportReviewBlock) {
  return proposalsForBlock(receipt, block).map((proposal) => proposal.canonicalText).join("\n");
}

function friendlyKind(kind: string) {
  const labels: Record<string, string> = {
    EMPLOYMENT: "Employment",
    PROJECT: "Project",
    ACHIEVEMENT: "Achievement",
    EDUCATION: "Education",
    CERTIFICATION: "Certification",
    SKILL: "Skills",
    LANGUAGE: "Languages",
    METRIC: "Metric",
    PROFILE: "Professional profile",
    CONTACT: "Contact information",
    NON_EVIDENCE: "Document structure",
    UNKNOWN: "Needs classification",
  };
  return labels[kind] ?? kind;
}

function structureLabel(receipt: ImportReceipt) {
  const status = receipt.reviewStructure?.status;
  if (status === "AI_STRUCTURED") return "AI organized";
  if (status === "HYBRID") return "AI + deterministic fallback";
  if (status === "DETERMINISTIC_FALLBACK") return "Deterministic fallback";
  return "Not organized yet";
}

export function ResumeImportWorkspace() {
  const [imports, setImports] = useState<ImportReceipt[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [kindByBlock, setKindByBlock] = useState<Record<string, CareerEvidenceKind>>({});
  const [kindByProposal, setKindByProposal] = useState<Record<string, CareerEvidenceKind>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mode, readByokCredential } = useAIAccessSession();

  async function refreshImports() {
    const response = await fetch("/api/imports/resume", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "IMPORT_LOAD_FAILED");
    const next = Array.isArray(body?.imports) ? body.imports as ImportReceipt[] : [];
    setImports(next);
    return next;
  }

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
    try {
      const form = new FormData();
      form.set("file", file);
      const headers: Record<string, string> = {};
      if (mode === "BYOK_GEMINI") {
        const credential = readByokCredential();
        if (credential) headers["x-cvengine-byok-key"] = credential;
      }
      const response = await fetch("/api/imports/resume", { method: "POST", body: form, headers });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "IMPORT_UPLOAD_FAILED");
      replaceReceipt(body.receipt as ImportReceipt);
      setFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "IMPORT_UPLOAD_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function performAcceptBlock(receipt: ImportReceipt, block: ImportReviewBlock, kind: CareerEvidenceKind) {
    const selected = proposalsForBlock(receipt, block).filter((proposal) => proposal.status === "PENDING");
    if (selected.length === 0) return receipt;
    if (selected.length === 1) {
      const response = await fetch(`/api/imports/proposals/${selected[0]!.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "IMPORT_PROPOSAL_UPDATE_FAILED");
      return body.receipt as ImportReceipt;
    }

    const contiguous = selected.every((proposal, index) => index === 0 || proposal.sourceLine === selected[index - 1]!.sourceLine + 1);
    if (!contiguous) throw new Error("IMPORT_REVIEW_BLOCK_SOURCE_LINES_NONCONTIGUOUS");
    const response = await fetch("/api/imports/proposals/accept-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalIds: selected.map((proposal) => proposal.id), kind }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "IMPORT_PROPOSAL_GROUP_UPDATE_FAILED");
    return body.receipt as ImportReceipt;
  }

  async function acceptBlock(receipt: ImportReceipt, block: ImportReviewBlock) {
    const suggested = isCareerEvidenceReviewKind(block.kind) ? block.kind : null;
    const kind = kindByBlock[block.id] ?? suggested;
    if (!kind) {
      setError("SELECT_EVIDENCE_KIND_REQUIRED");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await performAcceptBlock(receipt, block, kind);
      replaceReceipt(updated);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "IMPORT_REVIEW_ACCEPT_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function confirmClearBlocks(receipt: ImportReceipt) {
    const structure = receipt.reviewStructure;
    if (!structure) return;
    const clear = structure.blocks.filter((block) =>
      block.decision === "READY"
      && block.confidence === "HIGH"
      && isCareerEvidenceReviewKind(block.kind)
      && blockResolution(receipt, block) === "PENDING",
    );
    if (clear.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      let current = receipt;
      for (const block of clear) current = await performAcceptBlock(current, block, block.kind as CareerEvidenceKind);
      replaceReceipt(current);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "IMPORT_BULK_CONFIRM_FAILED");
      await refreshImports().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function dismissBlock(receipt: ImportReceipt, block: ImportReviewBlock) {
    const pending = proposalsForBlock(receipt, block).filter((proposal) => proposal.status === "PENDING");
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let latest = receipt;
      for (const proposal of pending) {
        const response = await fetch(`/api/imports/proposals/${proposal.id}/dismiss`, { method: "POST" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "IMPORT_PROPOSAL_UPDATE_FAILED");
        if (body?.receipt) latest = body.receipt as ImportReceipt;
      }
      replaceReceipt(latest);
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : "IMPORT_REVIEW_DISMISS_FAILED");
      await refreshImports().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function resolveProposal(receiptId: string, proposal: ImportProposal, action: "accept" | "dismiss") {
    const selectedKind = kindByProposal[proposal.id];
    if (action === "accept" && !selectedKind) {
      setError("SELECT_EVIDENCE_KIND_REQUIRED");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const init: RequestInit = { method: "POST" };
      if (action === "accept") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ kind: selectedKind });
      }
      const response = await fetch(`/api/imports/proposals/${proposal.id}/${action}`, init);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "IMPORT_PROPOSAL_UPDATE_FAILED");
      if (body.receipt) replaceReceipt(body.receipt as ImportReceipt);
      else {
        const refreshed = await refreshImports();
        const receipt = refreshed.find((item) => item.id === receiptId);
        if (receipt) replaceReceipt(receipt);
      }
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : "IMPORT_PROPOSAL_UPDATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  function duplicateDescription(block: ImportReviewBlock) {
    if (!block.duplicateOf) return null;
    const [receiptId, blockId] = block.duplicateOf.split(":");
    const receipt = imports.find((item) => item.id === receiptId);
    const candidate = receipt?.reviewStructure?.blocks.find((item) => item.id === blockId);
    if (!receipt || !candidate) return "A similar block exists in another imported CV.";
    const firstLine = proposalsForBlock(receipt, candidate)[0]?.canonicalText;
    return `Similar to ${receipt.sourceName}${firstLine ? ` — ${firstLine}` : ""}.`;
  }

  return (
    <section className="workspace" aria-labelledby="import-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Resume Import · AI organizes, you confirm truth</p>
        <h1 id="import-title">Upload your CV. Review only what actually needs your judgment.</h1>
        <p className="lead">CV Engine keeps mechanical source provenance underneath, while AI groups and classifies the document into human review blocks. Nothing imported is marked VERIFIED automatically.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <label>Resume file
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="primary" type="button" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Analyzing…" : "Analyze resume"}</button>
          <p className="muted">PDF or DOCX · maximum 5 MB. The source file remains request-scoped and is not persisted.</p>
          <p className="muted">AI may group, classify and flag duplicates. Only you can turn imported material into Career Evidence, and verification remains a separate human decision.</p>
        </section>

        <section className="evidence-list" aria-live="polite">
          {imports.length === 0 ? <div className="panel empty-state"><h2>No imports yet.</h2><p className="muted">Upload a CV and CV Engine will organize it before asking you to review anything.</p></div> : null}
          {imports.map((receipt) => {
            const structure = receipt.reviewStructure;
            if (!structure) {
              return <article className="panel evidence-card" key={receipt.id}>
                <div className="evidence-meta"><span>{receipt.mediaType}</span><span>{receipt.status}</span></div>
                <h2>{receipt.sourceName}</h2>
                {receipt.status === "EXTRACTED"
                  ? <p className="status">This import predates AI-first review. Upload the same file again to organize the existing mechanical receipt without duplicating source data.</p>
                  : <p className="status">{receipt.warningCode ?? "Mechanical extraction unavailable."} Use manual Career Evidence for this document.</p>}
              </article>;
            }

            const unresolved = structure.blocks.filter((block) => blockResolution(receipt, block) === "PENDING");
            const clear = unresolved.filter((block) => block.decision === "READY" && block.confidence === "HIGH" && isCareerEvidenceReviewKind(block.kind));
            const attention = unresolved.filter((block) => block.decision === "NEEDS_USER_REVIEW" || block.decision === "DUPLICATE_CANDIDATE" || block.kind === "UNKNOWN");
            const excluded = structure.blocks.filter((block) => block.decision === "NON_EVIDENCE");
            const resolved = structure.blocks.length - unresolved.length;

            return <article className="panel evidence-card" key={receipt.id}>
              <div className="evidence-meta"><span>{receipt.mediaType}</span><span>{structureLabel(receipt)}</span><span>{structure.blocks.length} blocks</span></div>
              <h2>{receipt.sourceName}</h2>
              <p className="lead">CV Engine organized {receipt.proposalCount} mechanical lines into {structure.blocks.length} review blocks. {attention.length} currently need your attention.</p>
              <p className="muted">{clear.length} clear · {attention.length} attention · {excluded.length} excluded from Career Evidence · {resolved} resolved.</p>
              {structure.status === "DETERMINISTIC_FALLBACK" ? <p className="status">Cloud/local AI was unavailable or not enabled, so CV Engine used deterministic section grouping. Nothing was silently accepted.</p> : null}

              {clear.length > 0 ? <section className="panel stack">
                <div><strong>{clear.length} clear block{clear.length === 1 ? "" : "s"}</strong><p className="muted">High-confidence structure only. This creates NEEDS_REVIEW evidence; it does not verify truth.</p></div>
                <button className="primary" type="button" disabled={busy} onClick={() => void confirmClearBlocks(receipt)}>Confirm all clear blocks</button>
                <details>
                  <summary>Review clear blocks first</summary>
                  <div className="stack">
                    {clear.map((block) => <div className="panel" key={block.id}>
                      <div className="evidence-meta"><span>{friendlyKind(block.kind)}</span><span>{block.confidence} confidence</span></div>
                      <p style={{ whiteSpace: "pre-wrap" }}>{blockText(receipt, block)}</p>
                      <div className="split-actions">
                        <button className="primary" type="button" disabled={busy} onClick={() => void acceptBlock(receipt, block)}>Looks correct</button>
                        <button className="secondary" type="button" disabled={busy} onClick={() => void dismissBlock(receipt, block)}>Dismiss</button>
                      </div>
                    </div>)}
                  </div>
                </details>
              </section> : null}

              {attention.length > 0 ? <section className="stack">
                <h3>Needs your attention</h3>
                {attention.map((block) => {
                  const suggestedKind = isCareerEvidenceReviewKind(block.kind) ? block.kind : null;
                  const selectedKind = kindByBlock[block.id] ?? suggestedKind ?? "";
                  return <div className="panel" key={block.id}>
                    <div className="evidence-meta"><span>{friendlyKind(block.kind)}</span><span>{block.confidence} confidence</span><span>{block.decision}</span></div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{blockText(receipt, block)}</p>
                    {block.decision === "DUPLICATE_CANDIDATE" ? <p className="status">Possible duplicate. {duplicateDescription(block)}</p> : null}
                    <label>Evidence type
                      <select value={selectedKind} onChange={(event) => setKindByBlock((current) => ({ ...current, [block.id]: event.target.value as CareerEvidenceKind }))}>
                        <option value="" disabled>Select evidence type</option>
                        {kinds.map((kind) => <option key={kind} value={kind}>{friendlyKind(kind)}</option>)}
                      </select>
                    </label>
                    <div className="split-actions">
                      <button className="primary" type="button" disabled={busy || !selectedKind} onClick={() => void acceptBlock(receipt, block)}>{block.decision === "DUPLICATE_CANDIDATE" ? "Keep this version" : "Looks correct"}</button>
                      <button className="secondary" type="button" disabled={busy} onClick={() => void dismissBlock(receipt, block)}>{block.decision === "DUPLICATE_CANDIDATE" ? "Dismiss as duplicate" : "Dismiss"}</button>
                    </div>
                  </div>;
                })}
              </section> : null}

              {excluded.length > 0 ? <details>
                <summary>Automatically excluded from Career Evidence ({excluded.length})</summary>
                <p className="muted">Headings, contact information and profile framing remain in source provenance but do not need to become Career Evidence. You can override this in Audit mode.</p>
                <div className="stack">
                  {excluded.map((block) => <div className="panel" key={block.id}>
                    <div className="evidence-meta"><span>{friendlyKind(block.kind)}</span><span>{block.confidence} confidence</span></div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{blockText(receipt, block)}</p>
                  </div>)}
                </div>
              </details> : null}

              <details>
                <summary>Audit mode · source lines, hashes and manual override</summary>
                <p className="muted">Source SHA-256 {receipt.sourceSha256} · review structure {structure.structureVersion} · {structure.aiRuns.length} bounded AI run receipt{structure.aiRuns.length === 1 ? "" : "s"}.</p>
                <div className="stack">
                  {receipt.proposals.map((proposal) => <div key={proposal.id} className="panel">
                    <div className="evidence-meta"><span>Line {proposal.sourceLine}</span><span>{proposal.status}</span></div>
                    <p>{proposal.canonicalText}</p>
                    {proposal.status === "PENDING" ? <div className="split-actions">
                      <select aria-label={`Evidence kind for proposal ${proposal.ordinal}`} value={kindByProposal[proposal.id] ?? ""} onChange={(event) => setKindByProposal((current) => ({ ...current, [proposal.id]: event.target.value as CareerEvidenceKind }))}>
                        <option value="" disabled>Select evidence type</option>
                        {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                      </select>
                      <button className="primary" disabled={busy || !kindByProposal[proposal.id]} type="button" onClick={() => void resolveProposal(receipt.id, proposal, "accept")}>Accept as NEEDS_REVIEW</button>
                      <button className="secondary" disabled={busy} type="button" onClick={() => void resolveProposal(receipt.id, proposal, "dismiss")}>Dismiss</button>
                    </div> : null}
                    {proposal.acceptedEvidenceId ? <p className="muted">Created Career Evidence {proposal.acceptedEvidenceId}. Verification remains separate.</p> : null}
                  </div>)}
                </div>
              </details>
            </article>;
          })}
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
