import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityInvitationsFindMessage {
  public readonly communityId: CommunityId;
  public readonly identityId: IdentityId;
  public readonly limit: number;
  public readonly after?: string;

  constructor(
    communityId: string,
    identityId: string,
    limit: number,
    after?: string,
  ) {
    this.communityId = new CommunityId(communityId);
    this.identityId = new IdentityId(identityId);
    this.limit = limit;
    this.after = after;
  }
}
