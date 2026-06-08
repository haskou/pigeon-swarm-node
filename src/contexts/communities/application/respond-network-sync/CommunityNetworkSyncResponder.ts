import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';

import CommunitySyncResponder from '../respond-sync/CommunitySyncResponder';
import { CommunitySyncResponseMessage } from '../respond-sync/messages/CommunitySyncResponseMessage';
import { CommunityNetworkSyncResponseMessage } from './messages/CommunityNetworkSyncResponseMessage';

export default class CommunityNetworkSyncResponder {
  private static readonly COMMUNITY_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly communityRepository: MongoCommunityRepository,
    private readonly communitySyncResponder: CommunitySyncResponder,
  ) {}

  public async respond(
    message: CommunityNetworkSyncResponseMessage,
  ): Promise<void> {
    const communities = await this.communityRepository.findByNetworkId(
      message.networkId,
      CommunityNetworkSyncResponder.COMMUNITY_CANDIDATE_LIMIT,
    );

    for (const community of communities) {
      await this.communitySyncResponder.respond(
        new CommunitySyncResponseMessage(
          community.getId().valueOf(),
          message.networkId.valueOf(),
          message.requestId,
        ),
      );
    }
  }
}
