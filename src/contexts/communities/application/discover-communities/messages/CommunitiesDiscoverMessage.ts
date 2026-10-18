import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunitiesDiscoverMessage {
  public readonly identityId: IdentityId;
  public readonly after?: string;
  public readonly limit: number;
  public readonly networkId?: string;
  public readonly query?: string;

  constructor(
    identityId: string,
    limit: number,
    after: string | undefined,
    networkId?: string,
    query?: string,
  ) {
    this.identityId = new IdentityId(identityId);
    this.after = after;
    this.limit = limit;
    this.networkId = networkId;
    this.query = query;
  }
}
