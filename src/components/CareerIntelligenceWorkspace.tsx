"use client";

import { useState } from "react";
import type { AIAccessMode } from "../domain/ai/AIAccess";
import { AssessmentWorkspace } from "./assessments/AssessmentWorkspace";
import { CareerEvidenceWorkspace } from "./career/CareerEvidenceWorkspace";
import { JobTruthWorkspace } from "./jobs/JobTruthWorkspace";
import { ResumeWorkspace } from "./resume/ResumeWorkspace";
import { CareerTargetWorkspace } from "./targets/CareerTargetWorkspace";

type Surface = "EVIDENCE" | "TARGET" | "JOB" | "ASSESSMENT" | "RESUME";
type Props = { aiAccessMode: AIAccessMode | null; onSignOut: () => Promise<void> };

export function CareerIntelligenceWorkspace({ aiAccessMode, onSignOut }: Props) {
  const [surface, setSurface] = useState<Surface>("EVIDENCE");
  return (
    <main className="first-run-shell">
      <header className="brand-bar">
        <div><span className="brand-mark">C</span><div><strong>CV Engine</strong><span>Evidence · intent · market truth · assessment · trusted resume</span></div></div>
        <span className="build-label">vNext · B4</span>
      </header>
      <nav className="split-actions" aria-label="CV Engine truth, analysis and resume surfaces">
        <button className={surface === "EVIDENCE" ? "primary" : "secondary"} type="button" onClick={() => setSurface("EVIDENCE")}>Career Evidence</button>
        <button className={surface === "TARGET" ? "primary" : "secondary"} type="button" onClick={() => setSurface("TARGET")}>Career Target</button>
        <button className={surface === "JOB" ? "primary" : "secondary"} type="button" onClick={() => setSurface("JOB")}>Job Truth</button>
        <button className={surface === "ASSESSMENT" ? "primary" : "secondary"} type="button" onClick={() => setSurface("ASSESSMENT")}>Assessment</button>
        <button className={surface === "RESUME" ? "primary" : "secondary"} type="button" onClick={() => setSurface("RESUME")}>ResumeVersion</button>
        <button className="text-button" type="button" onClick={() => void onSignOut()}>Sign out</button>
      </nav>
      {surface === "EVIDENCE" ? <CareerEvidenceWorkspace aiAccessMode={aiAccessMode} onSignOut={onSignOut} /> : null}
      {surface === "TARGET" ? <CareerTargetWorkspace /> : null}
      {surface === "JOB" ? <JobTruthWorkspace /> : null}
      {surface === "ASSESSMENT" ? <AssessmentWorkspace /> : null}
      {surface === "RESUME" ? <ResumeWorkspace /> : null}
    </main>
  );
}
