import { createHash } from "node:crypto";
import {
  CreateManualJobSnapshotInputSchema,
  type CreateManualJobSnapshotInput,
  type JobRequirementCategory,
  type JobRequirementDraft,
  type RequirementImportance,
} from "../../domain/jobs/JobSnapshot";

export const B2_JOB_ANALYZER_VERSION = "b2-deterministic-job-intelligence-v1" as const;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const REQUIRED_HEADING = /^(requirements?|minimum qualifications?|required qualifications?|must[- ]?have)$/i;
const PREFERRED_HEADING = /^(preferred qualifications?|preferred|nice[- ]to[- ]have|bonus)$/i;
const RESPONSIBILITY_HEADING = /^(responsibilities|what you(?:'|’)ll do|what you will do|the role)$/i;

function cleanHeading(value: string) {
  return value.replace(/[:：]\s*$/, "").trim();
}

function explicitImportance(value: string): RequirementImportance | null {
  if (/\b(required|must|required to|minimum|at least|need to|experience with)\b/i.test(value)) return "REQUIRED";
  if (/\b(preferred|nice to have|bonus|ideally|a plus)\b/i.test(value)) return "PREFERRED";
  return null;
}

function categoryOf(value: string, section: RequirementImportance): JobRequirementCategory {
  if (/\b(certification|certified|certificate|license|licence)\b/i.test(value)) return "CERTIFICATION";
  if (/\b(bachelor|master|degree|university|college|education)\b/i.test(value)) return "EDUCATION";
  if (/\b(years? of experience|experience)\b/i.test(value)) return "EXPERIENCE";
  if (/\b(english|spanish|french|german|portuguese|language|bilingual)\b/i.test(value)) return "LANGUAGE";
  if (/\b(remote|hybrid|on[- ]?site|onsite|location|relocat)\b/i.test(value)) return "LOCATION";
  if (/\b(senior|junior|lead|staff|principal|manager|director)\b/i.test(value)) return "SENIORITY";
  if (section === "CONTEXT" || /\b(responsible|responsibility|design|build|lead|own|deliver|manage)\b/i.test(value)) return "RESPONSIBILITY";
  if (/\b(communication|collaboration|leadership|stakeholder|teamwork|problem[- ]solving)\b/i.test(value)) return "SOFT_SKILL";
  if (/\b(git|docker|kubernetes|terraform|jenkins|jira|figma|postman|linux|aws|azure|gcp)\b/i.test(value)) return "TOOL";
  return "HARD_SKILL";
}

function conceptOf(sourceText: string) {
  const concept = sourceText
    .replace(/^\s*[-*•–—]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/^\s*(required|preferred|must have|nice to have|bonus)\s*[:：-]\s*/i, "")
    .trim();
  return concept.slice(0, 500) || sourceText.slice(0, 500);
}

export type DeterministicJobAnalysis = Readonly<{
  input: CreateManualJobSnapshotInput;
  semanticKey: string;
  rawDescriptionSha256: string;
  analyzerVersion: typeof B2_JOB_ANALYZER_VERSION;
  requirements: JobRequirementDraft[];
}>;

export function analyzeManualJobDescription(rawInput: CreateManualJobSnapshotInput): DeterministicJobAnalysis {
  const input = CreateManualJobSnapshotInputSchema.parse(rawInput);
  const rawDescriptionSha256 = sha256(input.rawDescription);
  const lines = input.rawDescription.split(/\r?\n/);
  const requirements: JobRequirementDraft[] = [];
  let sectionImportance: RequirementImportance | null = null;

  for (const rawLine of lines) {
    const sourceText = rawLine.trim();
    if (!sourceText) continue;

    const heading = cleanHeading(sourceText);
    if (REQUIRED_HEADING.test(heading)) { sectionImportance = "REQUIRED"; continue; }
    if (PREFERRED_HEADING.test(heading)) { sectionImportance = "PREFERRED"; continue; }
    if (RESPONSIBILITY_HEADING.test(heading)) { sectionImportance = "CONTEXT"; continue; }

    const cueImportance = explicitImportance(sourceText);
    const bulletLike = /^\s*[-*•–—]|^\s*\d+[.)]\s/.test(rawLine);
    const importance = cueImportance ?? (bulletLike ? sectionImportance : null);
    if (!importance || requirements.length >= 250) continue;

    const canonicalConcept = conceptOf(sourceText);
    const category = categoryOf(canonicalConcept, importance);
    const sourceTextSha256 = sha256(sourceText);
    const sourceOrdinal = requirements.length;
    const semanticKey = sha256([
      category,
      importance,
      normalized(canonicalConcept),
      sourceTextSha256,
      String(sourceOrdinal),
    ].join("\u001f"));

    requirements.push({ semanticKey, category, importance, canonicalConcept, sourceText, sourceTextSha256, sourceOrdinal });
  }

  const semanticKey = sha256([
    "MANUAL_JOB_DESCRIPTION",
    normalized(input.roleTitle),
    input.company ? normalized(input.company) : "",
    rawDescriptionSha256,
    B2_JOB_ANALYZER_VERSION,
    requirements.map((requirement) => requirement.semanticKey).join(","),
  ].join("\u001f"));

  return { input, semanticKey, rawDescriptionSha256, analyzerVersion: B2_JOB_ANALYZER_VERSION, requirements };
}
