export abstract class PrivateIdentityBinding {
  public abstract bind(identitySpki: string): string;
}
