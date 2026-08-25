const STRUCTURAL_TRUTH_ISSUES = new Set([
  'SUMMARY_PRESENCE_MISMATCH',
  'EXPERIENCE_COUNT_MISMATCH',
  'EDUCATION_COUNT_MISMATCH',
]);

export function classifyAcceptedTruthIssues(truthIssueKinds) {
  if (!Array.isArray(truthIssueKinds) || truthIssueKinds.length === 0) {
    return 'SUCCESS_TRUTH_SAFE';
  }

  if (truthIssueKinds.includes('FORBIDDEN_CANDIDATE_TRUTH_PRESENT')) {
    return 'UNSUPPORTED_TRUTH_ACCEPTED';
  }

  if (truthIssueKinds.some((issue) => STRUCTURAL_TRUTH_ISSUES.has(issue))) {
    return 'STRUCTURAL_TRUTH_MISMATCH';
  }

  if (truthIssueKinds.includes('REQUIRED_SOURCE_TRUTH_MISSING')) {
    return 'ROBUSTNESS_FAILURE_INCOMPLETE_ACCEPTANCE';
  }

  return 'ROBUSTNESS_FAILURE_INCOMPLETE_ACCEPTANCE';
}

export function isUnsafeAcceptedTruthClassification(classification) {
  return classification === 'UNSUPPORTED_TRUTH_ACCEPTED'
    || classification === 'UNSAFE_FAILURE_WITH_ACCEPTED_DATA';
}
