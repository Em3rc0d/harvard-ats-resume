"use client";

import { useState } from "react";
import type { AIAccessMode } from "../domain/ai/AIAccess";
import { AccountLifecycleWorkspace } from "./account/AccountLifecycleWorkspace";
import { AssessmentWorkspace } from "./assessments/AssessmentWorkspace";
import { CareerEvidenceWorkspace } from "./career/CareerEvidenceWorkspace";
import { ResumeImportWorkspace } from "./import/ResumeImportWorkspace";
import { ResumeImprovementWorkspace } from "./improve/ResumeImprovementWorkspace";
import { JobTruthWorkspace } from "./jobs/JobTruthWorkspace";
import { OpportunitySpaceWorkspace } from "./opportunities/OpportunitySpaceWorkspace";
import { ResumeWorkspace } from "./resume/ResumeWorkspace";
import { CareerTargetWorkspace } from "./targets/CareerTargetWorkspace";

type Surface = "IMPROVE" | "EVIDENCE" | "IMPORT" | "TARGET" | "JOB" | "ASSESSMENT" | "OPPORTUNITIES" | "RESUME" | "ACCOUNT";
type Props = { aiAccessMode: AIAccessMode | null; onSignOut: () => Promise<void> };

export function CareerIntelligenceWorkspace({ aiAccessMode, onSignOut }: Props) {
  const [surface, setSurface] = useState<Surface>("IMPROVE");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <main className="first-run-shell">
      <header className="brand-bar">
        <div><span className="brand-mark">C</span><div><strong>CV Engine</strong><span>Improve your resume · source-linked AI · factual guard · ATS-safe downloads</span></div></div>
        <span className="build-label">v1.2</span>
      </header>

      <nav className="split-actions primary-task-nav" aria-label="CV Engine primary and account actions">
        <button className={surface === "IMPROVE" ? "primary" : "secondary"} type="button" onClick={() => setSurface("IMPROVE")}>Improve Resume</button>
        <button className="secondary" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "Hide advanced tools" : "Advanced tools"}</button>
        <button className={surface === "ACCOUNT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("ACCOUNT")}>Account</button>
        <button className="text-button" type="button" onClick={() => void onSignOut()}>Sign out</button>
      </nav>

      {advancedOpen ? (
        <nav className="split-actions advanced-tool-nav" aria-label="Advanced CV Engine tools">
          <button className={surface === "EVIDENCE" ? "primary" : "secondary"} type="button" onClick={() => setSurface("EVIDENCE")}>Career Evidence</button>
          <button className={surface === "IMPORT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("IMPORT")}>Resume Import</button>
          <button className={surface === "TARGET" ? "primary" : "secondary"} type="button" onClick={() => setSurface("TARGET")}>Career Target</button>
          <button className={surface === "JOB" ? "primary" : "secondary"} type="button" onClick={() => setSurface("JOB")}>Job Truth</button>
          <button className={surface === "ASSESSMENT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("ASSESSMENT")}>Assessment</button>
          <button className={surface === "OPPORTUNITIES" ? "primary" : "secondary"} type="button" onClick={() => setSurface("OPPORTUNITIES")}>Opportunity Space</button>
          <button className={surface === "RESUME" ? "primary" : "secondary"} type="button" onClick={() => setSurface("RESUME")}>Legacy Resume Builder</button>
        </nav>
      ) : null}

      {surface === "IMPROVE" ? <ResumeImprovementWorkspace /> : null}
      {surface === "EVIDENCE" ? <CareerEvidenceWorkspace aiAccessMode={aiAccessMode} onSignOut={onSignOut} /> : null}
      {surface === "IMPORT" ? <ResumeImportWorkspace /> : null}
      {surface === "TARGET" ? <CareerTargetWorkspace /> : null}
      {surface === "JOB" ? <JobTruthWorkspace /> : null}
      {surface === "ASSESSMENT" ? <AssessmentWorkspace /> : null}
      {surface === "OPPORTUNITIES" ? <OpportunitySpaceWorkspace /> : null}
      {surface === "RESUME" ? <ResumeWorkspace /> : null}
      {surface === "ACCOUNT" ? <AccountLifecycleWorkspace /> : null}
    </main>
  );
}
