import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityChannelRenameMessage } from './messages/CommunityChannelRenameMessage';

export default class CommunityChannelRenamer {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async rename(
    message: CommunityChannelRenameMessage,
  ): Promise<Community> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );

    community.renameChannel(
      message.actorIdentityId,
      message.channelId,
      message.name,
    );
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_RENAMED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        message.channelId,
      ),
      { name: message.name.valueOf() },
    );

    return community;
  }
}
