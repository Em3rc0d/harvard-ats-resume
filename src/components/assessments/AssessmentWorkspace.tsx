"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";
import type { AssessmentBundle } from "../../domain/matching/Assessment";
import { useAIAccessSession } from "../providers/AIAccessSessionProvider";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
}

function explanationPrompt(bundle: AssessmentBundle, job: JobSnapshot | undefined) {
  const requirements = bundle.report.matches.map((match) => ({
    status: match.status,
    importance: match.importance,
    category: match.category,
    requirement: match.sourceText,
    rationale: match.rationale,
    supportingEvidence: match.supportingEvidence.map((evidence) => ({
      kind: evidence.kind,
      verificationStatus: evidence.verificationStatus,
      canonicalText: evidence.canonicalText,
      revision: evidence.revision,
    })),
  }));

  return JSON.stringify({
    roleTitle: job?.roleTitle ?? null,
    company: job?.company ?? null,
    deterministicAssessment: {
      recommendation: bundle.assessment.recommendation,
      action: bundle.assessment.action,
      evidenceStrength: bundle.assessment.evidenceStrength,
      rationale: bundle.assessment.rationale,
      scopeBoundary: bundle.assessment.scopeBoundary,
    },
    requirements,
  });
}

export function AssessmentWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [assessments, setAssessments] = useState<AssessmentBundle[]>([]);
  const [jobSnapshotId, setJobSnapshotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [aiReceipts, setAiReceipts] = useState<Record<string, string>>({});
  const { mode, readByokCredential } = useAIAccessSession();

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

  async function explain(bundle: AssessmentBundle) {
    const id = bundle.assessment.id;
    const byok = mode === "BYOK_GEMINI" ? readByokCredential() : null;
    if (mode === "BYOK_GEMINI" && !byok) {
      setError("BYOK_CREDENTIAL_REQUIRED_FOR_THIS_SESSION");
      return;
    }

    setAiBusyId(id);
    setError(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (byok) headers["x-cvengine-byok-key"] = byok;
    const response = await fetch("/api/ai/assist", {
      method: "POST",
      headers,
      body: JSON.stringify({
        capability: "OPPORTUNITY_EXPLANATION",
        prompt: explanationPrompt(bundle, jobById.get(bundle.assessment.jobSnapshotId)),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.failureCode ?? body?.error ?? "AI_EXPLANATION_UNAVAILABLE");
      setAiBusyId(null);
      return;
    }
    setAiExplanations((current) => ({ ...current, [id]: String(body?.proposal?.text ?? "") }));
    const provider = String(body?.provenance?.provider ?? "unknown");
    const model = String(body?.provenance?.model ?? "unknown");
    const requestId = String(body?.requestId ?? "unknown");
    setAiReceipts((current) => ({ ...current, [id]: `${provider} · ${model} · request ${requestId}` }));
    setAiBusyId(null);
  }

  return (
    <section className="workspace" aria-labelledby="assessment-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Assessment · Derived analysis</p>
        <h1 id="assessment-title">Compare evidence to what the employer actually requires.</h1>
        <p className="lead">B3 remains authoritative. B6 may explain that deterministic result, but it cannot invent evidence, change match states, estimate hiring probability or become candidate truth.</p>
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
          <p className="muted">AI access mode: <strong>{mode ?? "not configured"}</strong>. AI remains optional; trusted assessment and ResumeVersion paths work without it.</p>
        </section>

        <section className="evidence-list" aria-live="polite">
          {assessments.length === 0 ? <div className="panel empty-state"><h2>No assessments yet.</h2><p className="muted">Capture Career Evidence and Job Truth first. B3 refuses to invent support when either side is missing.</p></div> : null}
          {assessments.map((bundle) => {
            const job = jobById.get(bundle.assessment.jobSnapshotId);
            const unknownRequired = bundle.report.matches.filter((match) => match.importance === "REQUIRED" && match.status === "UNKNOWN");
            const explanation = aiExplanations[bundle.assessment.id];
            const receipt = aiReceipts[bundle.assessment.id];
            return <article className="panel evidence-card" key={bundle.assessment.id}>
              <div className="evidence-meta"><span>{label(bundle.assessment.recommendation)}</span><span>{label(bundle.assessment.evidenceStrength)} evidence</span></div>
              <h2>{job?.roleTitle ?? "Captured opportunity"}</h2>
              {job?.company ? <p className="muted">{job.company}</p> : null}
              <p>{bundle.assessment.rationale}</p>
              <p className="muted"><strong>{label(bundle.assessment.action)}</strong> · {bundle.assessment.scopeBoundary}</p>

              <div className="stack">
                <button className="secondary" type="button" disabled={aiBusyId === bundle.assessment.id} onClick={() => void explain(bundle)}>
                  {aiBusyId === bundle.assessment.id ? "Generating bounded explanation…" : "Explain with optional AI"}
                </button>
                {explanation ? <div className="panel">
                  <strong>AI explanation · proposal only</strong>
                  <p>{explanation}</p>
                  {receipt ? <p className="muted">{receipt}</p> : null}
                </div> : null}
              </div>

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
