"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";
import type { OpportunitySpaceBundle } from "../../domain/opportunities/OpportunitySpace";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
}

const emptySpace: OpportunitySpaceBundle = { observations: [], items: [] };

export function OpportunitySpaceWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [space, setSpace] = useState<OpportunitySpaceBundle>(emptySpace);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [jobsResponse, spaceResponse] = await Promise.all([
      fetch("/api/jobs", { cache: "no-store" }),
      fetch("/api/opportunity-space", { cache: "no-store" }),
    ]);
    const jobsBody = await jobsResponse.json().catch(() => null);
    const spaceBody = await spaceResponse.json().catch(() => null);
    if (!jobsResponse.ok) throw new Error(jobsBody?.error ?? "JOB_SNAPSHOT_LOAD_FAILED");
    if (!spaceResponse.ok) throw new Error(spaceBody?.error ?? "OPPORTUNITY_SPACE_LOAD_FAILED");
    setJobs(Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : []);
    setSpace({
      observations: Array.isArray(spaceBody?.observations) ? spaceBody.observations : [],
      items: Array.isArray(spaceBody?.items) ? spaceBody.items : [],
    });
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/jobs", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
      fetch("/api/opportunity-space", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => null) })),
    ]).then(([jobsResult, spaceResult]) => {
      if (cancelled) return;
      if (!jobsResult.response.ok || !spaceResult.response.ok) {
        setError(jobsResult.body?.error ?? spaceResult.body?.error ?? "OPPORTUNITY_SPACE_LOAD_FAILED");
        return;
      }
      setJobs(Array.isArray(jobsResult.body?.jobs) ? jobsResult.body.jobs : []);
      setSpace({
        observations: Array.isArray(spaceResult.body?.observations) ? spaceResult.body.observations : [],
        items: Array.isArray(spaceResult.body?.items) ? spaceResult.body.items : [],
      });
    });
    return () => { cancelled = true; };
  }, []);

  const observationByJob = useMemo(() => new Map(space.observations.map((item) => [item.jobSnapshotId, item])), [space.observations]);
  const observationById = useMemo(() => new Map(space.observations.map((item) => [item.id, item])), [space.observations]);

  async function mutate(payload: Record<string, string>, id: string) {
    setBusyId(id);
    setError(null);
    const response = await fetch("/api/opportunity-space", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "OPPORTUNITY_SPACE_MUTATION_FAILED");
      setBusyId(null);
      return;
    }
    try { await refresh(); } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "OPPORTUNITY_SPACE_REFRESH_FAILED");
    }
    setBusyId(null);
  }

  return (
    <section className="workspace" aria-labelledby="opportunity-space-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Opportunity Space · Market history</p>
        <h1 id="opportunity-space-title">Compare selected opportunities without turning employer requirements into candidate truth.</h1>
        <p className="lead">Every observation points to an immutable JobSnapshot. Every selected item points to an immutable B3 Assessment. New market information creates a new JobSnapshot/observation instead of rewriting history.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack">
          <h2>Captured Job Truth</h2>
          {jobs.length === 0 ? <p className="muted">Capture Job Truth first.</p> : null}
          {jobs.map((job) => {
            const observation = observationByJob.get(job.id);
            return <div className="panel" key={job.id}>
              <strong>{job.roleTitle}</strong>
              {job.company ? <p className="muted">{job.company}</p> : null}
              {observation ? <p className="muted">Observed {new Date(observation.observedAt).toLocaleString()}</p> : null}
              <button className="secondary" type="button" disabled={Boolean(observation) || busyId === job.id} onClick={() => void mutate({ action: "CAPTURE", jobSnapshotId: job.id }, job.id)}>
                {observation ? "Market observation captured" : "Capture market observation"}
              </button>
            </div>;
          })}
        </section>

        <section className="evidence-list" aria-live="polite">
          <div className="panel">
            <h2>Market observations</h2>
            {space.observations.length === 0 ? <p className="muted">No observations yet.</p> : null}
            {space.observations.map((observation) => <div className="panel" key={observation.id}>
              <strong>{observation.roleTitle}</strong>
              {observation.company ? <p className="muted">{observation.company}</p> : null}
              <p className="muted">Job hash {observation.rawDescriptionSha256.slice(0, 12)}…</p>
              <button className="primary" type="button" disabled={busyId === observation.id} onClick={() => void mutate({ action: "SELECT", marketObservationId: observation.id }, observation.id)}>
                Select latest assessed state
              </button>
            </div>)}
          </div>

          <div className="panel">
            <h2>Comparison</h2>
            <p className="muted">Order is deterministic from B3 recommendation/evidence categories; it is not a hiring probability or ATS score.</p>
            {space.items.length === 0 ? <p className="muted">Assess and select at least one observed opportunity.</p> : null}
            {space.items.map((item, index) => {
              const observation = observationById.get(item.marketObservationId);
              return <article className="panel evidence-card" key={item.id}>
                <div className="evidence-meta"><span>#{index + 1}</span><span>{label(item.recommendation)}</span><span>{label(item.evidenceStrength)} evidence</span></div>
                <h3>{observation?.roleTitle ?? "Observed opportunity"}</h3>
                {observation?.company ? <p className="muted">{observation.company}</p> : null}
                <p><strong>{label(item.action)}</strong> · decision {label(item.decision)}</p>
                <p className="muted">Assessment {item.opportunityAssessmentId} · semantic {item.assessmentSemanticKey.slice(0, 12)}…</p>
              </article>;
            })}
          </div>
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
