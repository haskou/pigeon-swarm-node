export abstract class PrivateGenesisProjectionAuthorizer {
  public abstract authorize(
    scopeId: string,
    ownerIdentityId: string,
    projection: Record<string, unknown>,
  ): Record<string, unknown>;
}
