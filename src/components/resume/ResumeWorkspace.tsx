"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobSnapshot } from "../../domain/jobs/JobSnapshot";
import type { OpportunityAssessment } from "../../domain/matching/Assessment";
import type { ResumeArtifact } from "../../domain/resume/ResumeArtifact";
import type { ResumePlan } from "../../domain/resume/ResumePlan";
import type { ResumeProfile } from "../../domain/resume/ResumeProfile";

type ResumeMode = ResumePlan["mode"];

type ProfileDraft = {
  displayName: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  links: string;
};

const emptyProfile: ProfileDraft = {
  displayName: "",
  headline: "",
  location: "",
  email: "",
  phone: "",
  links: "",
};

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function profileToDraft(profile: ResumeProfile | null): ProfileDraft {
  if (!profile) return emptyProfile;
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    location: profile.location ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    links: profile.links.join("\n"),
  };
}

export function ResumeWorkspace() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [assessments, setAssessments] = useState<OpportunityAssessment[]>([]);
  const [plans, setPlans] = useState<ResumePlan[]>([]);
  const [artifacts, setArtifacts] = useState<ResumeArtifact[]>([]);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfile);
  const [mode, setMode] = useState<ResumeMode | "">("");
  const [jobSnapshotId, setJobSnapshotId] = useState("");
  const [opportunityAssessmentId, setOpportunityAssessmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchJson("/api/jobs"),
      fetchJson("/api/assessments"),
      fetchJson("/api/resume-plans"),
      fetchJson("/api/resume-artifacts"),
      fetchJson("/api/resume-profile"),
    ]).then(([jobResult, assessmentResult, planResult, artifactResult, profileResult]) => {
      if (cancelled) return;
      const failures = [jobResult, assessmentResult, planResult, artifactResult, profileResult]
        .filter((result) => !result.response.ok)
        .map((result) => result.body?.error ?? "RESUME_WORKSPACE_LOAD_FAILED");
      if (failures.length > 0) setError(failures[0] ?? "RESUME_WORKSPACE_LOAD_FAILED");
      if (jobResult.response.ok) setJobs(Array.isArray(jobResult.body?.jobs) ? jobResult.body.jobs : []);
      if (assessmentResult.response.ok) setAssessments(Array.isArray(assessmentResult.body?.assessments) ? assessmentResult.body.assessments : []);
      if (planResult.response.ok) setPlans(Array.isArray(planResult.body?.plans) ? planResult.body.plans : []);
      if (artifactResult.response.ok) setArtifacts(Array.isArray(artifactResult.body?.artifacts) ? artifactResult.body.artifacts : []);
      if (profileResult.response.ok) {
        const loadedProfile = (profileResult.body?.profile ?? null) as ResumeProfile | null;
        setProfile(loadedProfile);
        setProfileDraft(profileToDraft(loadedProfile));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const jobAssessments = useMemo(
    () => assessments.filter((assessment) => assessment.jobSnapshotId === jobSnapshotId),
    [assessments, jobSnapshotId],
  );
  const selectedAssessmentId = jobAssessments.some((assessment) => assessment.id === opportunityAssessmentId)
    ? opportunityAssessmentId
    : (jobAssessments[0]?.id ?? "");

  async function saveProfile() {
    setSavingProfile(true);
    setError(null);
    setNotice(null);
    const links = profileDraft.links.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const response = await fetch("/api/resume-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: profileDraft.displayName,
        headline: profileDraft.headline || null,
        location: profileDraft.location || null,
        email: profileDraft.email || null,
        phone: profileDraft.phone || null,
        links,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "RESUME_PROFILE_SAVE_FAILED");
      setSavingProfile(false);
      return;
    }
    const saved = body.profile as ResumeProfile;
    setProfile(saved);
    setProfileDraft(profileToDraft(saved));
    setNotice(`ResumeProfile r${saved.revision} saved. Existing artifacts remain immutable.`);
    setSavingProfile(false);
  }

  async function createProfessionalResume() {
    if (!profile) {
      setError("RESUME_PROFILE_REQUIRED");
      return;
    }
    if (!mode) {
      setError("SELECT_RESUME_MODE_REQUIRED");
      return;
    }
    if (mode === "TARGETED" && !jobSnapshotId) {
      setError("SELECT_JOB_SNAPSHOT_REQUIRED");
      return;
    }
    if (mode === "TARGETED" && !selectedAssessmentId) {
      setError("TARGET_ASSESSMENT_REQUIRED");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const planResponse = await fetch("/api/resume-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "TARGETED"
        ? { mode, jobSnapshotId, opportunityAssessmentId: selectedAssessmentId }
        : { mode }),
    });
    const planBody = await planResponse.json().catch(() => null);
    if (!planResponse.ok) {
      setError(planBody?.error ?? "RESUME_PLAN_CREATE_FAILED");
      setBusy(false);
      return;
    }

    const plan = planBody.plan as ResumePlan;
    const artifactResponse = await fetch("/api/resume-artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumePlanId: plan.id }),
    });
    const artifactBody = await artifactResponse.json().catch(() => null);
    if (!artifactResponse.ok) {
      setError(artifactBody?.error ?? "RESUME_ARTIFACT_CREATE_FAILED");
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
      setBusy(false);
      return;
    }

    const artifact = artifactBody.artifact as ResumeArtifact;
    setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
    setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)]);
    setNotice(`ResumeArtifact created from ResumePlan ${plan.id.slice(0, 8)}… and ResumeProfile r${artifact.manifest.resumeProfileRevision}.`);
    setBusy(false);
  }

  return (
    <section className="workspace" aria-labelledby="resume-title">
      <div className="workspace-header"><div>
        <p className="eyebrow">CV Engine B9 · Professional resume projection</p>
        <h1 id="resume-title">Turn verified career truth into a professional, provenance-backed resume.</h1>
        <p className="lead">Career Evidence remains the source of truth. ResumeProfile owns identity/contact. ResumePlan explains selection and order. ResumeArtifact freezes the final document and exports the same semantic content to DOCX, PDF, TXT and provenance JSON.</p>
      </div></div>

      <div className="workspace-grid">
        <section className="panel stack" aria-labelledby="profile-title">
          <div>
            <p className="eyebrow">ResumeProfile · identity authority</p>
            <h2 id="profile-title">Header and contact</h2>
            <p className="muted">Profile edits create immutable revisions. They never become Career Evidence and never rewrite an existing ResumeArtifact.</p>
          </div>
          <label>Display name
            <input value={profileDraft.displayName} onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Your name" />
          </label>
          <label>Professional headline
            <input value={profileDraft.headline} onChange={(event) => setProfileDraft((current) => ({ ...current, headline: event.target.value }))} placeholder="Backend Engineer / Full Stack" />
          </label>
          <label>Location
            <input value={profileDraft.location} onChange={(event) => setProfileDraft((current) => ({ ...current, location: event.target.value }))} placeholder="City, Country" />
          </label>
          <label>Email
            <input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" />
          </label>
          <label>Phone
            <input value={profileDraft.phone} onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Optional" />
          </label>
          <label>Links · one per line
            <textarea rows={3} value={profileDraft.links} onChange={(event) => setProfileDraft((current) => ({ ...current, links: event.target.value }))} placeholder={"https://linkedin.com/in/...\nhttps://github.com/..."} />
          </label>
          <button className="secondary" type="button" disabled={savingProfile || !profileDraft.displayName.trim()} onClick={() => void saveProfile()}>
            {savingProfile ? "Saving profile…" : profile ? `Save new profile revision · current r${profile.revision}` : "Save ResumeProfile"}
          </button>
        </section>

        <section className="panel stack" aria-labelledby="projection-title">
          <div>
            <p className="eyebrow">ResumePlan → ResumeArtifact</p>
            <h2 id="projection-title">Create professional resume</h2>
          </div>
          <label>Resume mode
            <select value={mode} onChange={(event) => { setMode(event.target.value as ResumeMode | ""); setJobSnapshotId(""); setOpportunityAssessmentId(""); }}>
              <option value="">Select resume mode</option>
              <option value="GENERAL">General</option>
              <option value="TARGETED">Targeted to assessed job</option>
            </select>
          </label>
          {mode === "TARGETED" ? <>
            <label>Job Snapshot
              <select value={jobSnapshotId} onChange={(event) => { setJobSnapshotId(event.target.value); setOpportunityAssessmentId(""); }}>
                <option value="">Select a captured job</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.roleTitle}{job.company ? ` · ${job.company}` : ""}</option>)}
              </select>
            </label>
            <label>Opportunity Assessment
              <select value={selectedAssessmentId} onChange={(event) => setOpportunityAssessmentId(event.target.value)} disabled={!jobSnapshotId || jobAssessments.length === 0}>
                <option value="">{jobAssessments.length === 0 ? "Run Assessment first" : "Select assessment"}</option>
                {jobAssessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.recommendation} · {assessment.decision} · {new Date(assessment.createdAt).toLocaleDateString()}</option>)}
              </select>
            </label>
            {jobSnapshotId && jobAssessments.length === 0 ? <p className="status error">TARGETED planning is unavailable until this Job Snapshot has a current Opportunity Assessment.</p> : null}
          </> : null}
          {!profile ? <p className="status error">Save ResumeProfile before creating the final artifact. CV Engine will not export a nameless professional resume.</p> : null}
          <button className="primary" disabled={busy || !profile || !mode || (mode === "TARGETED" && (!jobSnapshotId || !selectedAssessmentId))} type="button" onClick={() => void createProfessionalResume()}>
            {busy ? "Building trusted artifact…" : "Create professional ResumeArtifact"}
          </button>
          <p className="muted">General planning selects current VERIFIED evidence under the one-page density policy. Targeted planning additionally requires a real Assessment and cannot turn GAP, UNKNOWN or blockers into candidate claims.</p>
        </section>
      </div>

      {notice ? <p className="status" role="status">{notice}</p> : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}

      <section className="evidence-list" aria-live="polite">
        {artifacts.length === 0 ? <div className="panel empty-state"><h2>No professional ResumeArtifacts yet.</h2><p className="muted">Save identity/contact, verify Career Evidence, then create a General or Targeted projection.</p></div> : null}
        {artifacts.map((artifact) => {
          const plan = plans.find((candidate) => candidate.id === artifact.sourceResumePlanId);
          const included = plan?.sourceReceipts.filter((receipt) => receipt.decision === "INCLUDED").length ?? artifact.manifest.receipts.length;
          const omitted = plan?.sourceReceipts.filter((receipt) => receipt.decision !== "INCLUDED").length ?? 0;
          return <article className="panel evidence-card" key={artifact.id}>
            <div className="evidence-meta"><span>{artifact.mode}</span><span>Artifact {artifact.artifactVersion.endsWith("v2") ? "v2" : "v1 legacy"}</span></div>
            {artifact.content.header.status === "AVAILABLE" ? <>
              <h2>{artifact.content.header.displayName}</h2>
              {artifact.content.header.headline ? <p><strong>{artifact.content.header.headline}</strong></p> : null}
              {artifact.content.header.contactLines.map((line) => <p className="muted" key={line}>{line}</p>)}
            </> : <h2>Historical artifact without ResumeProfile header</h2>}
            {artifact.content.professionalSummary ? <div className="stack"><strong>Professional Summary</strong><p>{artifact.content.professionalSummary.text}</p></div> : null}
            <div className="stack">
              {artifact.content.sections.map((section) => <div key={section.section}>
                <strong>{section.section}</strong>
                {section.layout === "INLINE_LIST"
                  ? <p>{section.entries.map((entry) => entry.renderedText).join(" · ")}</p>
                  : section.entries.map((entry) => <p key={entry.sourcePlanItemId}>• {entry.renderedText}</p>)}
              </div>)}
            </div>
            <p className="muted">Plan receipts: {included} included · {omitted} omitted · profile r{artifact.manifest.resumeProfileRevision ?? "legacy"} · evidence fingerprint {artifact.careerEvidenceFingerprintSha256.slice(0, 12)}…</p>
            <div className="split-actions">
              <a className="primary" href={`/api/resume-artifacts/${artifact.id}/export?format=docx`}>Download DOCX</a>
              <a className="secondary" href={`/api/resume-artifacts/${artifact.id}/export?format=pdf`}>Download PDF</a>
              <a className="secondary" href={`/api/resume-artifacts/${artifact.id}/export?format=text`}>TXT</a>
              <a className="secondary" href={`/api/resume-artifacts/${artifact.id}/export?format=json`}>Provenance JSON</a>
            </div>
          </article>;
        })}
      </section>
    </section>
  );
}
