import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateOperationSignature } from '@haskou/pigeon-swarm-crypto';

export default class PrivateOperationVerifier {
  public verify(signedJson: string, expectedAuthorDeviceKey: string): string {
    try {
      return PrivateOperationSignature.verify(
        signedJson,
        expectedAuthorDeviceKey,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
