import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvitation } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitation';

import { CommunityInvitationsResource } from '../resources/CommunityInvitationsResource';
import { CommunityInvitationViewModel } from './CommunityInvitationViewModel';

export class CommunityInvitationsViewModel {
  constructor(
    private readonly community: Community,
    private readonly invitations: CommunityInvitation[],
  ) {}

  public toResource(): CommunityInvitationsResource {
    return {
      invitations: this.invitations.map((invitation) =>
        new CommunityInvitationViewModel(
          this.community,
          invitation,
        ).toResource(),
      ),
    };
  }
}
