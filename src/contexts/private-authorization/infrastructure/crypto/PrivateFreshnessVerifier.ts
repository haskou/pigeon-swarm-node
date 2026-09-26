import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateFreshnessProof } from '@haskou/pigeon-swarm-crypto';

export default class PrivateFreshnessVerifier {
  public verify(
    signedProofJson: string,
    expectedSignerKey: string,
    expectedRequestJson: string,
  ): string {
    try {
      return PrivateFreshnessProof.verify(
        signedProofJson,
        expectedSignerKey,
        expectedRequestJson,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
