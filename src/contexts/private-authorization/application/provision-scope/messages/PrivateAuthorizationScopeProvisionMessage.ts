import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PrivateAuthorizationScopeProvisionMessage {
  public readonly authenticatedIdentityId: IdentityId;

  public constructor(
    authenticatedIdentityId: string,
    public readonly signedGenesisJson: string,
    public readonly protectedMlsState: string,
    public readonly projection: Record<string, unknown>,
  ) {
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
