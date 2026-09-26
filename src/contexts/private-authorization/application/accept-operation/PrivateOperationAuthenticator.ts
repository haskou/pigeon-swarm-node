export abstract class PrivateOperationAuthenticator {
  public abstract verify(
    signedJson: string,
    expectedAuthorDeviceKey: string,
  ): string;
}
