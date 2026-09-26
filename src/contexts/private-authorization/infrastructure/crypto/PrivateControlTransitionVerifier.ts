import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateControlSignature } from '@haskou/pigeon-swarm-crypto';

export default class PrivateControlTransitionVerifier {
  public authenticate(
    signedJson: string,
    trustedCheckpointJson: string,
    expectedMlsMessageHash: string,
  ): string {
    try {
      return PrivateControlSignature.authenticate(
        signedJson,
        trustedCheckpointJson,
        expectedMlsMessageHash,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public verify(
    signedJson: string,
    trustedCheckpointJson: string,
    expectedMlsMessageHash: string,
    expectedMlsContextHash: string,
  ): string {
    try {
      return PrivateControlSignature.verify(
        signedJson,
        trustedCheckpointJson,
        expectedMlsMessageHash,
        expectedMlsContextHash,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
