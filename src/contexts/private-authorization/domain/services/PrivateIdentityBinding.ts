export abstract class PrivateIdentityBinding {
  public abstract bind(identitySpki: string): string;
  public abstract identityIdFor(deviceKey: string): string;
}
