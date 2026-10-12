import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import CommunityFinder from '../find-community/CommunityFinder';
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
    const invite = await this.inviteRepository.requireByToken(
      message.inviteToken,
    );
    const uses = await this.inviteRepository.countUses(invite);

    invite.checkAcceptanceAvailability(uses);
    const community = await this.communityFinder.findById(
      invite.getCommunityId(),
    );

    return new CommunityInviteDetails(invite, community, uses.valueOf());
  }
}
