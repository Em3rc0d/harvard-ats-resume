"use client";

import { useState } from "react";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";
import styles from "./ResumeImprovementWorkspace.module.css";

type ImprovementResult = {
  runId: string;
  status: "IMPROVED" | "PARTIALLY_IMPROVED";
  unsupportedNewClaims: number;
  changes: string[];
  review: { originalText: string; improvedText: string };
  downloads: { docx: string; pdf: string; text: string; provenance: string };
};

export function ResumeImprovementWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [targetText, setTargetText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const { mode, readByokCredential } = useAIAccessSession();

  async function improve() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setReviewOpen(false);
    setAuditOpen(false);
    try {
      const form = new FormData();
      form.set("file", file);
      if (targetText.trim()) form.set("targetText", targetText.trim());
      const headers: Record<string, string> = {};
      if (mode === "BYOK_GEMINI") {
        const credential = readByokCredential();
        if (!credential) throw new Error("Your Gemini key is no longer available in this session. Re-open AI access and provide it again.");
        headers["x-cvengine-byok-key"] = credential;
      }
      const response = await fetch("/api/resume-improvements", { method: "POST", body: form, headers });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "RESUME_IMPROVEMENT_FAILED");
      setResult(body as ImprovementResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RESUME_IMPROVEMENT_FAILED");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className={`panel ${styles.panel}`} aria-labelledby="improvement-ready-heading">
        <p className="eyebrow">Resume improvement</p>
        <h1 id="improvement-ready-heading">Your improved resume is ready</h1>
        <p className="lead">CV Engine rewrote the presentation, checked every generated factual unit against your uploaded resume, and rendered an ATS-safe artifact.</p>

        <div className={styles.safety} aria-label="Quality and safety summary">
          <strong>Unsupported new claims: {result.unsupportedNewClaims}</strong>
          <span>{result.status === "PARTIALLY_IMPROVED" ? "Some wording was conservatively restored to source-supported text." : "Independent Fact Guardian passed."}</span>
        </div>

        <h2 className={styles.sectionTitle}>Changes made</h2>
        <ul className={styles.changeList}>{result.changes.map((change) => <li key={change}>{change}</li>)}</ul>

        <div className="split-actions">
          <a className={`primary ${styles.linkButton}`} href={result.downloads.docx}>Download DOCX</a>
          <a className={`secondary ${styles.linkButton}`} href={result.downloads.pdf}>Download PDF</a>
          <button className="secondary" type="button" onClick={() => setReviewOpen((open) => !open)}>{reviewOpen ? "Hide changes" : "Review changes"}</button>
        </div>

        {reviewOpen ? (
          <div className="presentation-review">
            <div className="presentation-review-header"><div><h3>Source vs improved</h3><p className="fine-print">Your upload remains the factual authority. Structural labels added by the renderer are not career claims.</p></div></div>
            <div className="presentation-diff">
              <article><strong>Uploaded resume text</strong><p>{result.review.originalText}</p></article>
              <article><strong>Improved resume text</strong><p>{result.review.improvedText}</p></article>
            </div>
          </div>
        ) : null}

        <div className={styles.audit}>
          <button className="text-button" type="button" onClick={() => setAuditOpen((open) => !open)}>{auditOpen ? "Hide audit downloads" : "Advanced / Audit"}</button>
          {auditOpen ? <div className="split-actions"><a className={`secondary ${styles.linkButton}`} href={result.downloads.text}>Download TXT</a><a className={`secondary ${styles.linkButton}`} href={result.downloads.provenance}>Download provenance JSON</a></div> : null}
        </div>

        <button className="text-button" type="button" onClick={() => { setResult(null); setFile(null); setTargetText(""); }}>Improve another resume</button>
      </section>
    );
  }

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="improve-resume-heading">
      <p className="eyebrow">Primary workflow</p>
      <h1 id="improve-resume-heading">Improve your resume</h1>
      <p className="lead">Upload the CV you already use. CV Engine will understand the whole document, improve its presentation, guard against invented career facts, and produce ATS-safe downloads.</p>

      <div className={`stack ${styles.form}`}>
        <label>
          Resume · PDF or DOCX
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <label>
          Job description <span className={styles.optional}>Optional — used for emphasis only, never as evidence about you</span>
          <textarea rows={8} maxLength={15000} placeholder="Paste a target job description if you want tailored emphasis…" value={targetText} onChange={(event) => setTargetText(event.target.value)} />
        </label>
      </div>

      <button className="primary" type="button" disabled={!file || busy} onClick={() => void improve()}>{busy ? "Analyzing and improving…" : "Improve my resume"}</button>
      {busy ? <p className="status" role="status">Understanding your resume → improving presentation → checking factual safety → rendering downloads…</p> : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}
      <p className="fine-print">Your job description is treated as market context. It cannot create skills, metrics, employers, dates, responsibilities, or other candidate facts.</p>
    </section>
  );
}
