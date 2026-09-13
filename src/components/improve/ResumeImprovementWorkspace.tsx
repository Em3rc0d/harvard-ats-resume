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

function friendlyError(code: unknown) {
  if (typeof code !== "string") return "We couldn’t finish your resume safely. Please try again.";
  if (code === "UNAUTHENTICATED") return "Your session ended. Sign in again to continue.";
  if (code === "SOURCE_UNREADABLE" || code === "MEDIA_TYPE_MISMATCH") return "We couldn’t read this file. Try a text-based PDF or DOCX.";
  if (code === "EMPTY_FILE") return "This file is empty. Choose another PDF or DOCX.";
  if (code === "SOURCE_TOO_LARGE") return "This file is too large. Choose a resume under 5 MB.";
  if (code === "SUPPORTED_FORMATS_ARE_PDF_AND_DOCX") return "Choose a PDF or DOCX resume.";
  if (code === "V12_AI_ACCESS_REQUIRED" || code === "V12_BYOK_REQUIRED") return "Reconnect AI access and try again.";
  if (code === "TARGET_TEXT_TOO_LARGE") return "The job description is too long. Shorten it and try again.";
  return "We couldn’t finish your resume safely. Please try again.";
}

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
        if (!credential) {
          setError("Reconnect AI access and try again.");
          return;
        }
        headers["x-cvengine-byok-key"] = credential;
      }
      const response = await fetch("/api/resume-improvements", { method: "POST", body: form, headers });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(friendlyError(body?.error));
        return;
      }
      setResult(body as ImprovementResult);
    } catch {
      setError("We couldn’t finish your resume safely. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className={`panel ${styles.panel}`} aria-labelledby="improvement-ready-heading">
        <p className="eyebrow">Resume improvement</p>
        <h1 id="improvement-ready-heading">Your improved resume is ready</h1>
        <p className="lead">Your resume was improved for clarity and ATS readability, then checked against the facts in your original CV.</p>

        <div className={styles.safety} aria-label="Quality and safety summary">
          <strong>Facts checked against your original CV</strong>
          <span>{result.unsupportedNewClaims === 0 ? "No unsupported claims were added." : "Unsupported wording was kept out of the final resume."}</span>
          <span>{result.status === "PARTIALLY_IMPROVED" ? "Some wording was automatically restored to match your source CV." : "The final wording stayed within the facts from your uploaded CV."}</span>
        </div>

        <h2 className={styles.sectionTitle}>What improved</h2>
        <ul className={styles.changeList}>{result.changes.map((change) => <li key={change}>{change}</li>)}</ul>

        <div className="split-actions">
          <a className={`primary ${styles.linkButton}`} href={result.downloads.docx}>Download DOCX</a>
          <a className={`secondary ${styles.linkButton}`} href={result.downloads.pdf}>Download PDF</a>
          <button className="secondary" type="button" onClick={() => setReviewOpen((open) => !open)}>{reviewOpen ? "Hide changes" : "Review changes"}</button>
        </div>

        {reviewOpen ? (
          <div className="presentation-review">
            <div className="presentation-review-header"><div><h3>Original vs improved</h3><p className="fine-print">Your uploaded CV remains the source of truth. The improved version may change wording and structure, not your career facts.</p></div></div>
            <div className="presentation-diff">
              <article><strong>Original CV</strong><p>{result.review.originalText}</p></article>
              <article><strong>Improved CV</strong><p>{result.review.improvedText}</p></article>
            </div>
          </div>
        ) : null}

        <div className={styles.audit}>
          <button className="text-button" type="button" onClick={() => setAuditOpen((open) => !open)}>{auditOpen ? "Hide advanced downloads" : "Advanced downloads"}</button>
          {auditOpen ? <div className="split-actions"><a className={`secondary ${styles.linkButton}`} href={result.downloads.text}>Download TXT</a><a className={`secondary ${styles.linkButton}`} href={result.downloads.provenance}>Download provenance JSON</a></div> : null}
        </div>

        <button className="text-button" type="button" onClick={() => { setResult(null); setFile(null); setTargetText(""); }}>Improve another resume</button>
      </section>
    );
  }

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="improve-resume-heading">
      <p className="eyebrow">Improve your CV</p>
      <h1 id="improve-resume-heading">Improve your resume</h1>
      <p className="lead">Upload your current CV. CV Engine improves the writing and structure, checks the result against your original, and gives you ATS-safe DOCX and PDF files.</p>

      <div className={`stack ${styles.form}`}>
        <label>
          Resume · PDF or DOCX
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {file ? <p className={styles.selectedFile}>Selected: {file.name}</p> : null}

        <details className={styles.tailor}>
          <summary>Tailor to a job <span className={styles.optional}>Optional</span></summary>
          <p className="fine-print">Paste a job description only if you want tailored emphasis. It never becomes a fact about you.</p>
          <label>
            Job description
            <textarea rows={7} maxLength={15000} placeholder="Paste the job description…" value={targetText} onChange={(event) => setTargetText(event.target.value)} />
          </label>
        </details>
      </div>

      <button className="primary" type="button" disabled={!file || busy} onClick={() => void improve()}>{busy ? "Improving your resume…" : "Improve my resume"}</button>
      {busy ? <p className="status" role="status">Improving your resume and checking every fact…</p> : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}
      <p className="fine-print">CV Engine can improve wording and structure, but it does not invent employers, skills, dates, metrics, responsibilities, or achievements.</p>
    </section>
  );
}
