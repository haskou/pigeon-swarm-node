import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityInvitationClaimsFindMessage {
  public readonly communityId: CommunityId;
  public readonly identityId: IdentityId;

  constructor(communityId: string, identityId: string) {
    this.communityId = new CommunityId(communityId);
    this.identityId = new IdentityId(identityId);
  }
}
