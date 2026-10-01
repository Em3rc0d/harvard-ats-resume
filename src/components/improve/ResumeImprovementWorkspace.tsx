"use client";

import { useState } from "react";
import { runLocalResumeImprovement, type LocalAIProgress } from "../../application/ai/BrowserLocalAI";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";
import styles from "./ResumeImprovementWorkspace.module.css";

type LocalImprovementResult = {
  originalText: string;
  improvedText: string;
  model: string;
  device: "webgpu" | "wasm";
};

type ImprovementResult = {
  runId: string;
  status: "IMPROVED" | "PARTIALLY_IMPROVED";
  unsupportedNewClaims: number;
  changes: string[];
  quality?: {
    localeConsistent: boolean;
    summaryPositioningPreserved: boolean;
    materialImprovementPresent: boolean;
    passed: boolean;
  };
  layout?: { pageCount: number; sparseTrailingPage: boolean };
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
  if (code === "LOCAL_FACT_GUARD_REJECTED") return "Local AI could not prove that the rewrite stayed within your original facts. Try again or use your own cloud provider.";
  if (code === "LOCAL_AI_WORKER_FAILED" || code === "LOCAL_AI_EMPTY_OUTPUT") return "Local AI could not finish on this device. Try your own Gemini, OpenAI, or Claude key instead.";
  return "We couldn’t finish your resume safely. Please try again.";
}

export function ResumeImprovementWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [targetText, setTargetText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [localResult, setLocalResult] = useState<LocalImprovementResult | null>(null);
  const [localProgress, setLocalProgress] = useState<LocalAIProgress | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const { mode, provider, readByokCredential } = useAIAccessSession();

  async function improve() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setLocalResult(null);
    setLocalProgress(null);
    setReviewOpen(false);
    setAuditOpen(false);
    try {
      if (mode === "NO_CLOUD_AI") {
        const extractForm = new FormData();
        extractForm.set("file", file);
        const extractionResponse = await fetch("/api/resume-local/extract", {
          method: "POST",
          body: extractForm,
        });
        const extraction = await extractionResponse.json().catch(() => null);
        if (!extractionResponse.ok || typeof extraction?.sourceText !== "string") {
          setError(friendlyError(extraction?.error));
          return;
        }
        const local = await runLocalResumeImprovement(
          extraction.sourceText,
          targetText.trim() || null,
          setLocalProgress,
        );
        setLocalResult({
          originalText: extraction.sourceText,
          improvedText: local.improvedText,
          model: local.model,
          device: local.device,
        });
        return;
      }

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
        headers["x-cvengine-ai-provider"] = provider;
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

  async function downloadLocalArtifact(format: "docx" | "pdf" | "text") {
    if (!localResult) return;
    setError(null);
    const response = await fetch("/api/resume-local/artifact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ improvedText: localResult.improvedText, format }),
    });
    if (!response.ok) {
      setError("We couldn’t render this local result. Try again.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `CV_Optimizado_Local.${format === "text" ? "txt" : format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (localResult) {
    return (
      <section className={`panel ${styles.panel}`} aria-labelledby="local-improvement-ready-heading">
        <p className="eyebrow">Local AI</p>
        <h1 id="local-improvement-ready-heading">Your local AI rewrite is ready for review</h1>
        <p className="lead">
          The language model ran on this device using {localResult.device === "webgpu" ? "WebGPU" : "CPU/WASM"}.
          No Gemini, OpenAI, Claude, or CV Engine platform token was used for inference.
        </p>

        <div className={styles.safety} aria-label="Local AI safety summary">
          <strong>Source-bound local check passed</strong>
          <span>CV Engine rejected new numeric claims and asked a separate local guard pass to compare the rewrite to your uploaded CV.</span>
          <span>Local AI is still hardware- and model-dependent. Review the result before sending it to an employer.</span>
        </div>

        <div className="split-actions">
          <button className="primary" type="button" onClick={() => void downloadLocalArtifact("docx")}>Download DOCX</button>
          <button className="secondary" type="button" onClick={() => void downloadLocalArtifact("pdf")}>Download PDF</button>
          <button className="secondary" type="button" onClick={() => setReviewOpen((open) => !open)}>{reviewOpen ? "Hide changes" : "Review changes"}</button>
        </div>

        {reviewOpen ? (
          <div className="presentation-review">
            <div className="presentation-review-header">
              <div>
                <h3>Original vs local rewrite</h3>
                <p className="fine-print">Model: {localResult.model}. The local result is not automatically uploaded as a durable Resume Improvement Run.</p>
              </div>
            </div>
            <div className="presentation-diff">
              <article><strong>Original CV</strong><p>{localResult.originalText}</p></article>
              <article><strong>Local AI rewrite</strong><p>{localResult.improvedText}</p></article>
            </div>
          </div>
        ) : null}

        <button className="text-button" type="button" onClick={() => void downloadLocalArtifact("text")}>Download TXT</button>
        {error ? <p className="status error" role="alert">{error}</p> : null}
        <button className="text-button" type="button" onClick={() => { setLocalResult(null); setFile(null); setTargetText(""); }}>Improve another resume</button>
      </section>
    );
  }

  if (result) {
    const fullyQualified = result.status === "IMPROVED" && result.quality?.passed !== false && result.layout?.sparseTrailingPage !== true;
    return (
      <section className={`panel ${styles.panel}`} aria-labelledby="improvement-ready-heading">
        <p className="eyebrow">Resume improvement</p>
        <h1 id="improvement-ready-heading">{fullyQualified ? "Your improved resume is ready" : "Your resume is ready for review"}</h1>
        <p className="lead">{fullyQualified
          ? "Your resume was improved for clarity and ATS readability, then checked against the facts in your original CV."
          : "Your resume stayed source-backed, but CV Engine kept it in review because at least one quality gate did not fully qualify."}</p>

        <div className={styles.safety} aria-label="Quality and safety summary">
          <strong>Facts checked against your original CV</strong>
          <span>{result.unsupportedNewClaims === 0 ? "No unsupported claims were added." : "Unsupported wording was kept out of the final resume."}</span>
          <span>{fullyQualified ? "The final wording stayed within the facts from your uploaded CV." : "This result is safe to inspect, but it is not being presented as a final-quality improvement."}</span>
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
      {busy ? (
        <p className="status" role="status">
          {mode === "NO_CLOUD_AI"
            ? (localProgress?.message ?? "Preparing local AI on this device…")
            : "Improving your resume and checking every fact…"}
        </p>
      ) : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}
      <p className="fine-print">CV Engine can improve wording and structure, but it does not invent employers, skills, dates, metrics, responsibilities, or achievements.</p>
    </section>
  );
}
