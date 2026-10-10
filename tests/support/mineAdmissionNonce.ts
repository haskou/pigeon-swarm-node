import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

/** Finds a nonce that satisfies the configured identity admission difficulty. */
export function mineAdmissionNonce(
  identityId: string,
  networkIds: string[],
): string {
  return IdentityAdmissionProof.mine(identityId, networkIds);
}
