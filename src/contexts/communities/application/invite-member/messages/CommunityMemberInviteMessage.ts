import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityMemberInviteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly invitedIdentityId: IdentityId;

  constructor(
    communityId: string,
    actorIdentityId: string,
    invitedIdentityId: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.invitedIdentityId = new IdentityId(invitedIdentityId);
  }
}
