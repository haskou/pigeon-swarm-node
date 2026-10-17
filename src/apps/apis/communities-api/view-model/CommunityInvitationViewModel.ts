import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvitation } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitation';

import { CommunityInvitationResource } from '../resources/CommunityInvitationResource';

export class CommunityInvitationViewModel {
  constructor(
    private readonly community: Community,
    private readonly invitation: CommunityInvitation,
  ) {}

  public toResource(): CommunityInvitationResource {
    return this.invitation.toPrimitives(this.community);
  }
}
