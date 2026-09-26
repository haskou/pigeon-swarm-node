export class PrivateAuthorizationScopeProvisionMessage {
  public constructor(
    public readonly authenticatedIdentityId: string,
    public readonly signedGenesisJson: string,
    public readonly protectedMlsState: string,
    public readonly projection: Record<string, unknown>,
  ) {}
}
