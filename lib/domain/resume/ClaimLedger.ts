import type { CareerAssertion } from '../candidate/CareerAssertion';
import type { CareerAssertionId, ResumeClaimId } from '../shared/identifiers';
import { domainId, uniqueIds } from '../shared/identifiers';
import { createResumeClaim, type ResumeClaim } from './ResumeClaim';

export interface ClaimLedger {
  readonly assertionsById: ReadonlyMap<CareerAssertionId, CareerAssertion>;
  readonly claimsById: ReadonlyMap<ResumeClaimId, ResumeClaim>;
}

export function createClaimLedger(assertions: readonly CareerAssertion[]): ClaimLedger {
  const assertionIds = assertions.map((assertion) => assertion.id);

  if (!uniqueIds(assertionIds)) {
    throw new Error('ClaimLedger requires unique CareerAssertion identifiers.');
  }

  return {
    assertionsById: new Map(assertions.map((assertion) => [assertion.id, assertion])),
    claimsById: new Map(),
  };
}

export function registerResumeClaim(
  ledger: ClaimLedger,
  input: ResumeClaim,
): ClaimLedger {
  if (ledger.claimsById.has(input.id)) {
    throw new Error(`ClaimLedger already contains ResumeClaim: ${input.id}.`);
  }

  const claim = createResumeClaim(input, ledger.assertionsById);
  const claimsById = new Map(ledger.claimsById);
  claimsById.set(claim.id, claim);

  return {
    assertionsById: ledger.assertionsById,
    claimsById,
  };
}

/**
 * Creates a fact-preserving claim whose wording is exactly the canonical
 * assertion statement. AI rewrites may be proposed later, but they must pass
 * grounding validation before replacing this wording.
 */
export function registerCanonicalClaim(
  ledger: ClaimLedger,
  assertionId: CareerAssertionId,
  claimIdValue: string,
): ClaimLedger {
  const assertion = ledger.assertionsById.get(assertionId);

  if (!assertion) {
    throw new Error(`Cannot create ResumeClaim from unknown CareerAssertion: ${assertionId}.`);
  }

  return registerResumeClaim(ledger, {
    id: domainId('ResumeClaim', claimIdValue),
    assertionIds: [assertionId],
    wording: assertion.statement,
  });
}

export function getResumeClaims(ledger: ClaimLedger): readonly ResumeClaim[] {
  return Array.from(ledger.claimsById.values());
}
