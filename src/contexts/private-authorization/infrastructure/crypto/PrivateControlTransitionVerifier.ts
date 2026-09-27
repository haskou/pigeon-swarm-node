import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateControlSignature } from '@haskou/pigeon-swarm-crypto';

export default class PrivateControlTransitionVerifier {
  public authenticate(
    signedJson: string,
    trustedCheckpointJson: string,
    authenticatedOperationJson: string,
    expectedMlsMessageHash: string,
  ): string {
    try {
      return PrivateControlSignature.authenticate(
        signedJson,
        trustedCheckpointJson,
        authenticatedOperationJson,
        expectedMlsMessageHash,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public verify(
    signedJson: string,
    trustedCheckpointJson: string,
    authenticatedOperationJson: string,
    expectedMlsMessageHash: string,
    expectedMlsContextHash: string,
  ): string {
    try {
      return PrivateControlSignature.verify(
        signedJson,
        trustedCheckpointJson,
        authenticatedOperationJson,
        expectedMlsMessageHash,
        expectedMlsContextHash,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
