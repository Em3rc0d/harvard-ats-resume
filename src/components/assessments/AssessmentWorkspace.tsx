"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";
import type { AssessmentBundle } from "../../domain/matching/Assessment";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
}

export function AssessmentWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [assessments, setAssessments] = useState<AssessmentBundle[]>([]);
  const [jobSnapshotId, setJobSnapshotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/jobs", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
      fetch("/api/assessments", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
    ]).then(([jobResult, assessmentResult]) => {
      if (cancelled) return;
      if (!jobResult.response.ok) setError(jobResult.body?.error ?? "JOB_SNAPSHOT_LOAD_FAILED");
      else {
        const loadedJobs = Array.isArray(jobResult.body?.jobs) ? jobResult.body.jobs : [];
        setJobs(loadedJobs);
        setJobSnapshotId((current) => current || loadedJobs[0]?.id || "");
      }
      if (!assessmentResult.response.ok) setError(assessmentResult.body?.error ?? "ASSESSMENT_LOAD_FAILED");
      else setAssessments(Array.isArray(assessmentResult.body?.assessments) ? assessmentResult.body.assessments : []);
    });
    return () => { cancelled = true; };
  }, []);

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  async function assess() {
    if (!jobSnapshotId) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobSnapshotId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "ASSESSMENT_CREATE_FAILED");
      setBusy(false);
      return;
    }
    const bundle = body.assessment as AssessmentBundle;
    setAssessments((current) => [bundle, ...current.filter((item) => item.assessment.id !== bundle.assessment.id)]);
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="assessment-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Assessment · Derived analysis</p>
        <h1 id="assessment-title">Compare evidence to what the employer actually requires.</h1>
        <p className="lead">B3 consumes immutable Job Truth and current Career Evidence. Missing evidence remains UNKNOWN; this surface never claims a hiring probability or commercial ATS score.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <label>Job Snapshot
            <select value={jobSnapshotId} onChange={(event) => setJobSnapshotId(event.target.value)}>
              <option value="">Select a captured job</option>
              {jobs.map((job) => <option value={job.id} key={job.id}>{job.roleTitle}{job.company ? ` · ${job.company}` : ""}</option>)}
            </select>
          </label>
          <button className="primary" disabled={busy || !jobSnapshotId} type="button" onClick={() => void assess()}>
            Create evidence assessment
          </button>
          <p className="muted">The browser supplies only the Job Snapshot ID. Ownership, evidence fingerprint, matches and recommendations are derived inside the trusted persistence boundary.</p>
        </section>

        <section className="evidence-list" aria-live="polite">
          {assessments.length === 0 ? <div className="panel empty-state"><h2>No assessments yet.</h2><p className="muted">Capture Career Evidence and Job Truth first. B3 refuses to invent support when either side is missing.</p></div> : null}
          {assessments.map((bundle) => {
            const job = jobById.get(bundle.assessment.jobSnapshotId);
            const unknownRequired = bundle.report.matches.filter((match) => match.importance === "REQUIRED" && match.status === "UNKNOWN");
            return <article className="panel evidence-card" key={bundle.assessment.id}>
              <div className="evidence-meta"><span>{label(bundle.assessment.recommendation)}</span><span>{label(bundle.assessment.evidenceStrength)} evidence</span></div>
              <h2>{job?.roleTitle ?? "Captured opportunity"}</h2>
              {job?.company ? <p className="muted">{job.company}</p> : null}
              <p>{bundle.assessment.rationale}</p>
              <p className="muted"><strong>{label(bundle.assessment.action)}</strong> · {bundle.assessment.scopeBoundary}</p>

              {unknownRequired.length > 0 ? <div className="stack">
                <strong>Required items still unknown</strong>
                {unknownRequired.map((match) => <p className="muted" key={match.id}>{match.sourceText}</p>)}
              </div> : null}

              <div className="stack">
                {bundle.report.matches.map((match) => <div key={match.id}>
                  <strong>{match.status} · {match.importance} · {match.category}</strong>
                  <p>{match.sourceText}</p>
                  <p className="muted">{match.rationale}</p>
                  {match.supportingEvidence.map((evidence) => <p className="muted" key={`${match.id}-${evidence.id}-${evidence.revision}`}>
                    Evidence r{evidence.revision} · {evidence.verificationStatus}: {evidence.canonicalText}
                  </p>)}
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
