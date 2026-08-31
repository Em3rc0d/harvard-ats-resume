import { createHash } from "node:crypto";
import {
  CreateCareerTargetInputSchema,
  type CreateCareerTargetInput,
} from "../../domain/targets/CareerTarget";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function canonicalTextList(values: readonly string[]) {
  const byMeaning = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    byMeaning.set(normalizeText(trimmed), trimmed);
  }
  return [...byMeaning.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function canonicalEnumList<T extends string>(values: readonly T[]) {
  return [...new Set(values)].sort() as T[];
}

export function canonicalizeCareerTargetInput(input: CreateCareerTargetInput): CreateCareerTargetInput {
  const parsed = CreateCareerTargetInputSchema.parse(input);
  return {
    ...parsed,
    targetRole: parsed.targetRole.trim().replace(/\s+/g, " "),
    jobFamily: parsed.jobFamily?.trim().replace(/\s+/g, " "),
    preferredSeniorities: canonicalEnumList(parsed.preferredSeniorities),
    preferredLocations: canonicalTextList(parsed.preferredLocations),
    workModels: canonicalEnumList(parsed.workModels),
    employmentTypes: canonicalEnumList(parsed.employmentTypes),
    industries: canonicalTextList(parsed.industries),
  };
}

export function careerTargetSemanticKey(input: CreateCareerTargetInput) {
  const target = canonicalizeCareerTargetInput(input);
  const semanticPayload = {
    targetRole: normalizeText(target.targetRole),
    jobFamily: target.jobFamily ? normalizeText(target.jobFamily) : null,
    preferredSeniorities: target.preferredSeniorities,
    preferredLocations: target.preferredLocations.map(normalizeText),
    workModels: target.workModels,
    employmentTypes: target.employmentTypes,
    industries: target.industries.map(normalizeText),
    relocationPreference: target.relocationPreference,
    priority: target.priority,
  };

  return createHash("sha256").update(JSON.stringify(semanticPayload)).digest("hex");
}
