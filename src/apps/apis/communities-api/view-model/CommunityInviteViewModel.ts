import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';

import { CommunityInviteResource } from '../resources/CommunityInviteResource';

export class CommunityInviteViewModel {
  constructor(private readonly invite: CommunityInvite) {}

  public toResource(): CommunityInviteResource {
    const primitives = this.invite.toPrimitives();

    return {
      communityId: primitives.communityId,
      encryptedCommunityKey: primitives.encryptedCommunityKey,
      expiresAt: primitives.expiresAt,
      inviteToken: primitives.token,
      maxUses: primitives.maxUses,
      uses: primitives.uses,
    };
  }
}
