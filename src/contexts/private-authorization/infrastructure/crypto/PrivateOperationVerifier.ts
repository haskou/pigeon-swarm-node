import { PrivateOperationAuthenticator } from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAuthenticator';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { AuthenticatedPrivateOperationJson } from '@app/contexts/private-authorization/domain/value-objects/AuthenticatedPrivateOperationJson';
import { PrivateOperationSignature } from '@haskou/pigeon-swarm-crypto';

export default class PrivateOperationVerifier extends PrivateOperationAuthenticator {
  public verify(
    signedJson: string,
    expectedAuthorDeviceKey: string,
  ): AuthenticatedPrivateOperationJson {
    try {
      return new AuthenticatedPrivateOperationJson(
        PrivateOperationSignature.verify(signedJson, expectedAuthorDeviceKey),
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
