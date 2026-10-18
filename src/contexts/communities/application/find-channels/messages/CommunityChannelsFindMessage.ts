import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelsFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly limit: number;
  public readonly after?: string;

  constructor(
    communityId: string,
    actorIdentityId: string,
    limit: number,
    after?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.limit = limit;
    this.after = after;
  }
}
