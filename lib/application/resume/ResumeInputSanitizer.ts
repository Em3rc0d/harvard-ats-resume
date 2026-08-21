import {
  hasMaterialCareerEvidence,
  type ResumeRequest,
} from '../../schemas';

/**
 * Transport-level hygiene for candidate input before trusted downstream work.
 * This function creates no evidence, makes no model call, and never derives new
 * career facts. It is intentionally provider-independent so opportunity and
 * resume flows do not depend on an AI runtime just to sanitize input.
 */
export function sanitizeResumeData(data: ResumeRequest): ResumeRequest {
  const sanitizeString = (str: string): string => str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, 50000);

  const sanitized = JSON.parse(
    JSON.stringify(data, (_key, value) => typeof value === 'string' ? sanitizeString(value) : value),
  ) as ResumeRequest;

  if (!hasMaterialCareerEvidence(sanitized)) {
    throw new Error('Candidate data contains no material career evidence.');
  }

  return sanitized;
}
