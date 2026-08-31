"use client";

import { useEffect, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";

export function JobTruthWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [roleTitle, setRoleTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawDescription, setRawDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/jobs", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok) setError(body?.error ?? "JOB_SNAPSHOT_LOAD_FAILED");
      else setJobs(Array.isArray(body?.jobs) ? body.jobs : []);
    });
    return () => { cancelled = true; };
  }, []);

  async function capture() {
    if (!roleTitle.trim() || !rawDescription.trim()) return;
    setBusy(true); setError(null);
    const response = await fetch("/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleTitle, ...(company.trim() ? { company } : {}), rawDescription }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error ?? "JOB_SNAPSHOT_CREATE_FAILED"); setBusy(false); return; }
    const job = body.job as JobSnapshot;
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    setRoleTitle(""); setCompany(""); setRawDescription(""); setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="job-truth-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Job Truth · Market fact</p>
        <h1 id="job-truth-title">Capture what the employer actually said.</h1>
        <p className="lead">CV Engine extracts requirements deterministically from the pasted description. Role and company metadata are never injected into requirement text, and requirements never become Career Evidence.</p>
      </div></div>
      <div className="workspace-grid">
        <section className="panel stack">
          <label>Role title<input maxLength={300} value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="Backend Engineer" /></label>
          <label>Company<input maxLength={300} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Optional" /></label>
          <label>Job Description<textarea rows={14} maxLength={100000} value={rawDescription} onChange={(event) => setRawDescription(event.target.value)} placeholder={'Requirements:\n- Java is required.\nPreferred:\n- Docker is a plus.'} /></label>
          <button className="primary" disabled={busy || !roleTitle.trim() || !rawDescription.trim()} type="button" onClick={() => void capture()}>Capture immutable Job Snapshot</button>
        </section>
        <section className="evidence-list" aria-live="polite">
          {jobs.length === 0 ? <div className="panel empty-state"><h2>No Job Snapshots yet.</h2><p className="muted">B2 records market truth only. Matching and Opportunity Assessment begin in B3.</p></div> : null}
          {jobs.map((job) => <article className="panel evidence-card" key={job.id}>
            <div className="evidence-meta"><span>Immutable snapshot</span><span>{job.requirements.length} requirements</span></div>
            <h2>{job.roleTitle}</h2>
            {job.company ? <p className="muted">{job.company}</p> : null}
            <div className="stack">
              {job.requirements.length === 0 ? <p className="muted">No explicit requirement statements were deterministically recognized. CV Engine does not guess.</p> : null}
              {job.requirements.map((requirement) => <div key={requirement.id}>
                <strong>{requirement.importance} · {requirement.category}</strong>
                <p className="muted">{requirement.sourceText}</p>
              </div>)}
            </div>
          </article>)}
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
