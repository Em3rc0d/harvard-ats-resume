import { z } from "zod";

export const TruthClassSchema = z.enum([
  "CANDIDATE_FACT",
  "MARKET_FACT",
  "INTENT",
  "DERIVED_ANALYSIS",
  "PRESENTATION",
]);

export type TruthClass = z.infer<typeof TruthClassSchema>;

export const TRUTH_AUTHORITY = {
  CANDIDATE_FACT: "CAREER_EVIDENCE",
  MARKET_FACT: "JOB_SNAPSHOT",
  INTENT: "CAREER_TARGET",
  DERIVED_ANALYSIS: "CV_ENGINE",
  PRESENTATION: "RESUME_VERSION",
} as const satisfies Record<TruthClass, string>;
