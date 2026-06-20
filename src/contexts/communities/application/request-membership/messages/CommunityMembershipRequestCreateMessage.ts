import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityMembershipRequestCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;

  constructor(communityId: string, actorIdentityId: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
  }
}
