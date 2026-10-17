import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvitation } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitation';

import { CommunityInvitationPreviewResource } from '../resources/CommunityInvitationPreviewResource';

/** Holds no issuer, invitee, use count, member, peer id or address. */
export class CommunityInvitationPreviewViewModel {
  constructor(
    private readonly community: Community,
    private readonly invitation: CommunityInvitation,
  ) {}

  public toResource(): CommunityInvitationPreviewResource {
    const community = this.community.toPrimitives();

    return {
      communityAvatar: community.avatar,
      communityBanner: community.banner,
      communityId: community.id,
      communityName: community.name,
      expiresAt: this.invitation.getExpiresAt(),
      invitationId: this.invitation.getId(),
      networkId: community.networkId,
    };
  }
}
