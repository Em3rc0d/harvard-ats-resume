"use client";

import { useState } from "react";
import type { AIAccessMode } from "../domain/ai/AIAccess";
import { AccountLifecycleWorkspace } from "./account/AccountLifecycleWorkspace";
import { AssessmentWorkspace } from "./assessments/AssessmentWorkspace";
import { CareerEvidenceWorkspace } from "./career/CareerEvidenceWorkspace";
import { ResumeImportWorkspace } from "./import/ResumeImportWorkspace";
import { JobTruthWorkspace } from "./jobs/JobTruthWorkspace";
import { OpportunitySpaceWorkspace } from "./opportunities/OpportunitySpaceWorkspace";
import { ResumeWorkspace } from "./resume/ResumeWorkspace";
import { CareerTargetWorkspace } from "./targets/CareerTargetWorkspace";

type Surface = "EVIDENCE" | "IMPORT" | "TARGET" | "JOB" | "ASSESSMENT" | "OPPORTUNITIES" | "RESUME" | "ACCOUNT";
type Props = { aiAccessMode: AIAccessMode | null; onSignOut: () => Promise<void> };

export function CareerIntelligenceWorkspace({ aiAccessMode, onSignOut }: Props) {
  const [surface, setSurface] = useState<Surface>("EVIDENCE");
  return (
    <main className="first-run-shell">
      <header className="brand-bar">
        <div><span className="brand-mark">C</span><div><strong>CV Engine</strong><span>Evidence · import · intent · market truth · assessment · opportunity space · trusted resume</span></div></div>
        <span className="build-label">vNext · B8 RC</span>
      </header>
      <nav className="split-actions" aria-label="CV Engine truth, import, analysis, opportunity, resume and account surfaces">
        <button className={surface === "EVIDENCE" ? "primary" : "secondary"} type="button" onClick={() => setSurface("EVIDENCE")}>Career Evidence</button>
        <button className={surface === "IMPORT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("IMPORT")}>Resume Import</button>
        <button className={surface === "TARGET" ? "primary" : "secondary"} type="button" onClick={() => setSurface("TARGET")}>Career Target</button>
        <button className={surface === "JOB" ? "primary" : "secondary"} type="button" onClick={() => setSurface("JOB")}>Job Truth</button>
        <button className={surface === "ASSESSMENT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("ASSESSMENT")}>Assessment</button>
        <button className={surface === "OPPORTUNITIES" ? "primary" : "secondary"} type="button" onClick={() => setSurface("OPPORTUNITIES")}>Opportunity Space</button>
        <button className={surface === "RESUME" ? "primary" : "secondary"} type="button" onClick={() => setSurface("RESUME")}>ResumeVersion</button>
        <button className={surface === "ACCOUNT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("ACCOUNT")}>Account</button>
        <button className="text-button" type="button" onClick={() => void onSignOut()}>Sign out</button>
      </nav>
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
