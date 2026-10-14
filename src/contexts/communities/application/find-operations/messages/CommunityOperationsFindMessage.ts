import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityOperationsFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly after?: string;
  public readonly communityId: CommunityId;
  public readonly limit: number;

  constructor(
    communityId: string,
    actorIdentityId: string,
    limit: number,
    after?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.after = after;
    this.communityId = new CommunityId(communityId);
    this.limit = limit;
  }
}
