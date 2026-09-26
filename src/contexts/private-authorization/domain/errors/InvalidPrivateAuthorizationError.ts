export class InvalidPrivateAuthorizationError extends Error {
  public constructor() {
    super('Invalid private authorization');
    this.name = InvalidPrivateAuthorizationError.name;
  }
}
