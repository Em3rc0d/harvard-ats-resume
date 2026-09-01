"use client";

import { useEffect, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";
import type { ResumeMode, ResumeVersion } from "../../domain/resume/ResumeVersion";

export function ResumeWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [mode, setMode] = useState<ResumeMode>("GENERAL");
  const [jobSnapshotId, setJobSnapshotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/jobs", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
      fetch("/api/resumes", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
    ]).then(([jobResult, resumeResult]) => {
      if (cancelled) return;
      if (jobResult.response.ok) {
        const loadedJobs = Array.isArray(jobResult.body?.jobs) ? jobResult.body.jobs : [];
        setJobs(loadedJobs);
        setJobSnapshotId(loadedJobs[0]?.id ?? "");
      }
      if (resumeResult.response.ok) setResumes(Array.isArray(resumeResult.body?.resumes) ? resumeResult.body.resumes : []);
      else setError(resumeResult.body?.error ?? "RESUME_VERSION_LOAD_FAILED");
    });
    return () => { cancelled = true; };
  }, []);

  async function createResume() {
    if (mode === "TARGETED" && !jobSnapshotId) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "TARGETED" ? { mode, jobSnapshotId } : { mode }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "RESUME_VERSION_CREATE_FAILED");
      setBusy(false);
      return;
    }
    const resume = body.resume as ResumeVersion;
    setResumes((current) => [resume, ...current.filter((item) => item.id !== resume.id)]);
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="resume-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">ResumeVersion · Deterministic projection</p>
        <h1 id="resume-title">Turn verified evidence into an immutable, provenance-backed resume.</h1>
        <p className="lead">B4 never turns Job Truth into candidate claims. Trusted claims are copied exactly from VERIFIED Career Evidence and retain their evidence ID, revision and hashes.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <label>Resume mode
            <select value={mode} onChange={(event) => setMode(event.target.value as ResumeMode)}>
              <option value="GENERAL">General</option>
              <option value="TARGETED">Targeted to captured job</option>
            </select>
          </label>
          {mode === "TARGETED" ? <label>Job Snapshot
            <select value={jobSnapshotId} onChange={(event) => setJobSnapshotId(event.target.value)}>
              <option value="">Select a captured job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.roleTitle}{job.company ? ` · ${job.company}` : ""}</option>)}
            </select>
          </label> : null}
          <button className="primary" disabled={busy || (mode === "TARGETED" && !jobSnapshotId)} type="button" onClick={() => void createResume()}>
            Create trusted ResumeVersion
          </button>
          <p className="muted">General uses all current VERIFIED evidence. Targeted uses only VERIFIED evidence explicitly supporting MATCH/POTENTIAL_MATCH in the current evidence assessment.</p>
        </section>

        <section className="evidence-list" aria-live="polite">
          {resumes.length === 0 ? <div className="panel empty-state"><h2>No ResumeVersions yet.</h2><p className="muted">Verify Career Evidence first. B4 fails closed when there is no verified material to project.</p></div> : null}
          {resumes.map((resume) => <article className="panel evidence-card" key={resume.id}>
            <div className="evidence-meta"><span>{resume.mode}</span><span>{resume.claims.length} verified claims</span></div>
            <h2>{resume.mode === "TARGETED" ? "Targeted ResumeVersion" : "General ResumeVersion"}</h2>
            <p className="muted">Composer {resume.composerVersion} · Renderer {resume.rendererVersion}</p>
            <div className="stack">
              {resume.claims.map((claim) => <div key={claim.id}>
                <strong>{claim.ordinal}. {claim.evidenceKind} · evidence r{claim.evidenceRevision}</strong>
                <p>{claim.renderedText}</p>
                <p className="muted">Evidence {claim.evidenceId} · SHA-256 {claim.evidenceTextSha256.slice(0, 12)}…</p>
              </div>)}
            </div>
            <div className="split-actions">
              <a className="secondary" href={`/api/resumes/${resume.id}/export?format=text`}>Export text</a>
              <a className="secondary" href={`/api/resumes/${resume.id}/export?format=json`}>Export provenance JSON</a>
            </div>
          </article>)}
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
