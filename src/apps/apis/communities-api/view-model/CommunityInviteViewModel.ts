import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';

import { CommunityInviteResource } from '../resources/CommunityInviteResource';

export class CommunityInviteViewModel {
  constructor(
    private readonly invite: CommunityInvite,
    private readonly uses: number,
  ) {}

  public toResource(): CommunityInviteResource {
    const primitives = this.invite.toPrimitives();

    return {
      communityId: primitives.communityId,
      expiresAt: primitives.expiresAt,
      inviteToken: primitives.token,
      maxUses: primitives.maxUses,
      uses: this.uses,
    };
  }
}
