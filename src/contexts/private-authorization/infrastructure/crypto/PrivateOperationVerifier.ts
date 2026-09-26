import { PrivateOperationAuthenticator } from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAuthenticator';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateOperationSignature } from '@haskou/pigeon-swarm-crypto';

export default class PrivateOperationVerifier extends PrivateOperationAuthenticator {
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
