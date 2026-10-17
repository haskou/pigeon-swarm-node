import { assert } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationPreviewMessage } from './messages/CommunityInvitationPreviewMessage';

/**
 * What a link holder sees before it signs a claim: the community and the
 * invitation found by its public key, only while the invitation is live at
 * this node's frontier and open by this node's clock. Any other invitation
 * is refused exactly like an unknown community.
 */
export default class CommunityInvitationPreviewer {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async preview(message: CommunityInvitationPreviewMessage): Promise<{
    community: Community;
    invitation: CommunityInvitation;
  }> {
    const community = await this.communityFinder.findById(message.communityId);
    const invitation = (
      await this.communityRepository.findInvitations(message.communityId)
    ).findByKey(message.invitationKey);

    assert(
      invitation !== undefined &&
        invitation.isLiveIn(community) &&
        invitation.isOpenAt(Date.now()),
      new CommunityNotFoundError(),
    );

    return { community, invitation };
  }
}
