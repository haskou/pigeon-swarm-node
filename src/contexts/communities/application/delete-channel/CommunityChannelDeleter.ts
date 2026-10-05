import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelType } from '../../domain/value-objects/CommunityChannelType';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityChannelDeleteMessage } from './messages/CommunityChannelDeleteMessage';

export default class CommunityChannelDeleter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async delete(
    message: CommunityChannelDeleteMessage,
  ): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);
    const channelType = community
      .toPrimitives()
      .textChannels.some(
        (channel) => channel.id === message.channelId.valueOf(),
      )
      ? CommunityChannelType.TEXT
      : CommunityChannelType.VOICE;
    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.CHANNEL_DELETED,
      { channelId: message.channelId.valueOf() },
    );

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_DELETED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        message.channelId,
      ),
      message.moderationLog,
      { type: channelType.valueOf() },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
