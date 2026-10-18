import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationsPage } from './CommunityInvitationsPage';
import { CommunityInvitationsFindMessage } from './messages/CommunityInvitationsFindMessage';

/**
 * The invitations of a community, for its members. They already read every
 * invitation in the operations, so this reveals nothing new to them.
 */
export default class CommunityInvitationsFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async find(
    message: CommunityInvitationsFindMessage,
  ): Promise<CommunityInvitationsPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.identityId);

    const invitations = (
      await this.communityRepository.findInvitations(message.communityId)
    ).list();

    return new CommunityInvitationsPage(
      community,
      PageSlice.of<CommunityInvitation>({
        after: message.after,
        items: invitations,
        limit: message.limit,
        order: 'asc',
        position: (invitation) => invitation.getId(),
      }),
    );
  }
}
