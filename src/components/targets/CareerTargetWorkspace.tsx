"use client";

import { useEffect, useState } from "react";
import type { CareerTarget } from "../../domain/targets/CareerTarget";

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function CareerTargetWorkspace() {
  const [targets, setTargets] = useState<CareerTarget[]>([]);
  const [role, setRole] = useState("");
  const [jobFamily, setJobFamily] = useState("");
  const [locations, setLocations] = useState("");
  const [industries, setIndustries] = useState("");
  const [seniority, setSeniority] = useState("MID");
  const [workModel, setWorkModel] = useState("REMOTE");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/career/targets", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok) setError(body?.error ?? "CAREER_TARGET_LOAD_FAILED");
      else setTargets(Array.isArray(body?.targets) ? body.targets : []);
    });
    return () => { cancelled = true; };
  }, []);

  async function saveTarget() {
    if (!role.trim()) return;
    setBusy(true); setError(null);
    const response = await fetch("/api/career/targets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetRole: role,
        ...(jobFamily.trim() ? { jobFamily } : {}),
        preferredSeniorities: [seniority], preferredLocations: csv(locations),
        workModels: [workModel], employmentTypes: [employmentType], industries: csv(industries),
        relocationPreference: "UNSPECIFIED", priority: "PRIMARY", activate: true,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error ?? "CAREER_TARGET_SAVE_FAILED"); setBusy(false); return; }
    const target = body.target as CareerTarget;
    setTargets((current) => [target, ...current.filter((item) => item.id !== target.id)].map((item) => ({ ...item, isActive: item.id === target.id })));
    setRole(""); setJobFamily(""); setBusy(false);
  }

  async function activate(targetId: string) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/career/targets/${targetId}/activate`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error ?? "CAREER_TARGET_ACTIVATION_FAILED"); setBusy(false); return; }
    setTargets((current) => current.map((item) => ({ ...item, isActive: item.id === targetId })));
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="career-target-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">Career Target · Intent</p>
        <h1 id="career-target-title">Choose a direction without rewriting your truth.</h1>
        <p className="lead">Career Target records what you want. It never becomes proof that you have a skill, credential, seniority, or experience.</p>
      </div></div>
      <div className="workspace-grid">
        <section className="panel stack">
          <label>Target role<input value={role} maxLength={300} onChange={(event) => setRole(event.target.value)} placeholder="Backend Engineer" /></label>
          <label>Job family<input value={jobFamily} maxLength={200} onChange={(event) => setJobFamily(event.target.value)} placeholder="Software Engineering" /></label>
          <label>Preferred seniority<select value={seniority} onChange={(event) => setSeniority(event.target.value)}><option>MID</option><option>JUNIOR</option><option>SENIOR</option><option>LEAD</option><option>STAFF</option></select></label>
          <label>Work model<select value={workModel} onChange={(event) => setWorkModel(event.target.value)}><option>REMOTE</option><option>HYBRID</option><option>ONSITE</option></select></label>
          <label>Employment type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}><option>FULL_TIME</option><option>CONTRACT</option><option>INTERNSHIP</option><option>PART_TIME</option></select></label>
          <label>Preferred locations<input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Lima, Remote" /></label>
          <label>Industries<input value={industries} onChange={(event) => setIndustries(event.target.value)} placeholder="Fintech, SaaS" /></label>
          <button className="primary" disabled={busy || !role.trim()} type="button" onClick={() => void saveTarget()}>Save and activate target</button>
        </section>
        <section className="evidence-list" aria-live="polite">
          {targets.length === 0 ? <div className="panel empty-state"><h2>No target directions yet.</h2><p className="muted">Saving a new direction preserves previous targets rather than overwriting them.</p></div> : null}
          {targets.map((target) => <article className="panel evidence-card" key={target.id}>
            <div className="evidence-meta"><span>{target.priority}</span><span>{target.isActive ? "Active intent" : "Saved direction"}</span></div>
            <h2>{target.targetRole}</h2>
            <p className="muted">{[target.jobFamily, ...target.preferredLocations, ...target.workModels].filter(Boolean).join(" · ") || "No additional constraints"}</p>
            {!target.isActive ? <button className="secondary" disabled={busy} type="button" onClick={() => void activate(target.id)}>Make active</button> : null}
          </article>)}
        </section>
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </section>
  );
}
