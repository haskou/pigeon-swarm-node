import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

/**
 * Finds a nonce that satisfies the protocol admission difficulty, or one that
 * meets exactly `exactBits` (and not one more) when a test needs to pin the
 * proof's strength against a raised requirement.
 */
export function mineAdmissionNonce(
  identityId: string,
  networkIds: string[],
  exactBits?: number,
): string {
  const proof = new IdentityAdmissionProof(identityId, networkIds);

  if (exactBits === undefined) return proof.mine();

  return proof.mine(
    (nonce) =>
      proof.isValid(nonce, exactBits) && !proof.isValid(nonce, exactBits + 1),
    exactBits,
  );
}
