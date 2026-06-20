import { CommunityInviteNotFoundError } from '../../domain/errors/CommunityInviteNotFoundError';
import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityInviteDetails } from './CommunityInviteDetails';
import { CommunityInviteFindMessage } from './messages/CommunityInviteFindMessage';

export default class CommunityInviteDetailsFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly inviteRepository: CommunityInviteRepository,
  ) {}

  public async find(
    message: CommunityInviteFindMessage,
  ): Promise<CommunityInviteDetails> {
    const invite = await this.inviteRepository.findByToken(message.inviteToken);

    if (!invite) {
      throw new CommunityInviteNotFoundError();
    }
    invite.checkAcceptanceAvailability();
    const community = await this.communityFinder.find(
      new CommunityFindMessage(invite.getCommunityId().valueOf()),
    );

    return new CommunityInviteDetails(invite, community);
  }
}
