import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityModerationLogsPage } from './CommunityModerationLogsPage';
import { CommunityModerationLogsFindMessage } from './messages/CommunityModerationLogsFindMessage';

export default class CommunityModerationLogsFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly moderationLogRepository: CommunityModerationLogRepository,
  ) {}

  public async find(
    message: CommunityModerationLogsFindMessage,
  ): Promise<CommunityModerationLogsPage> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );

    community.viewModerationLog(message.actorIdentityId);
    const logs = await this.moderationLogRepository.findByCommunity(
      community.getId(),
      message.limit,
      message.beforeLogId,
    );

    return new CommunityModerationLogsPage(logs, message.limit);
  }
}
