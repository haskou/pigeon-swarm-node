import { AuthenticatedPrivateOperationJson } from '../../domain/value-objects/AuthenticatedPrivateOperationJson';

export abstract class PrivateOperationAuthenticator {
  public abstract verify(
    signedJson: string,
    expectedAuthorDeviceKey: string,
  ): AuthenticatedPrivateOperationJson;
}
