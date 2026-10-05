import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';

import { CommunityInviteDetailsResource } from '../resources/CommunityInviteDetailsResource';
import { CommunityInviteViewModel } from './CommunityInviteViewModel';

export class CommunityInviteDetailsViewModel {
  constructor(
    private readonly invite: CommunityInvite,
    private readonly community: Community,
    private readonly uses: number,
  ) {}

  public toResource(): CommunityInviteDetailsResource {
    const invite = new CommunityInviteViewModel(
      this.invite,
      this.uses,
    ).toResource();
    const community = this.community.toPrimitives();

    return {
      ...invite,
      communityAvatar: community.avatar,
      communityBanner: community.banner,
      communityName: community.name,
    };
  }
}
