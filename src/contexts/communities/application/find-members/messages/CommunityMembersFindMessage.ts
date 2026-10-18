import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityMembersFindMessage {
  public readonly communityId: CommunityId;
  public readonly actorIdentityId: IdentityId;
  public readonly limit: number;
  public readonly after?: string;

  constructor(
    communityId: string,
    actorIdentityId: string,
    limit: number,
    after?: string,
  ) {
    this.communityId = new CommunityId(communityId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.limit = limit;
    this.after = after;
  }
}
