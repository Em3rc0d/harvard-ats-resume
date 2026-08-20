import { z } from 'zod';
import type { ResumeRequest } from '../../schemas';

export const resumeGenerationProposalSchema = z.object({
  formattedResume: z.string().min(100),
  matchedKeywords: z.array(z.string()),
  improvedResume: z.string(),
});

export type ResumeGenerationProposal = z.infer<typeof resumeGenerationProposalSchema>;

export interface AIResumeProvider {
  generate(data: ResumeRequest): Promise<ResumeGenerationProposal>;
}

export function parseResumeGenerationProposal(input: unknown): ResumeGenerationProposal {
  return resumeGenerationProposalSchema.parse(input);
}
