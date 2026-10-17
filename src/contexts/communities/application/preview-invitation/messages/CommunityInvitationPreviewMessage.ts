import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityInvitationPreviewMessage {
  public readonly communityId: CommunityId;
  public readonly invitationKey: string;

  constructor(communityId: string, invitationKey: string) {
    this.communityId = new CommunityId(communityId);
    this.invitationKey = invitationKey;
  }
}
