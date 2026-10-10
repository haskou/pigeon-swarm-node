import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

/** Finds a nonce that satisfies the configured identity admission difficulty. */
export function mineAdmissionNonce(
  identityId: string,
  networkIds: string[],
): string {
  let nonce = 0;

  while (
    !IdentityAdmissionProof.isValid(identityId, networkIds, nonce.toString())
  ) {
    nonce += 1;
  }

  return nonce.toString();
}
