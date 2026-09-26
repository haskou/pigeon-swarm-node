export class PrivateAuthorizationConflictError extends Error {
  public constructor() {
    super('Private authorization conflict');
    this.name = PrivateAuthorizationConflictError.name;
  }
}
