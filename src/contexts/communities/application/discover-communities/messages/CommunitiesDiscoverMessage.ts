import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunitiesDiscoverMessage {
  public readonly identityId: IdentityId;
  public readonly networkId?: string;
  public readonly query?: string;

  constructor(identityId: string, networkId?: string, query?: string) {
    this.identityId = new IdentityId(identityId);
    this.networkId = networkId;
    this.query = query;
  }
}
