import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';

export class CommunityInviteAcceptMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly inviteToken: CommunityInviteToken;

  constructor(inviteToken: string, actorIdentityId: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.inviteToken = new CommunityInviteToken(inviteToken);
  }
}
