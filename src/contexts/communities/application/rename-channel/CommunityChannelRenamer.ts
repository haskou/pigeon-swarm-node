import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
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
    const community = await this.communityFinder.findById(message.communityId);

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.CHANNEL_RENAMED,
      {
        channelId: message.channelId.valueOf(),
        name: message.name.valueOf(),
      },
    );
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_RENAMED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        message.channelId,
      ),
      message.moderationLog,
      { name: message.name.valueOf() },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
