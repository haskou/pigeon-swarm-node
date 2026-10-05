import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityVoiceChannel } from '../../domain/entities/channels/CommunityVoiceChannel';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelType } from '../../domain/value-objects/CommunityChannelType';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityChannelCreateMessage } from './messages/CommunityChannelCreateMessage';

export default class CommunityVoiceChannelCreator {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async create(
    message: CommunityChannelCreateMessage,
  ): Promise<CommunityVoiceChannel> {
    const community = await this.communityFinder.findById(message.communityId);
    const channelId = CommunityChannelId.derive(
      message.communityId.valueOf(),
      message.actorIdentityId.valueOf(),
      message.operation.createdAt,
    );
    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.CHANNEL_CREATED,
      {
        channelId: channelId.valueOf(),
        name: message.name.valueOf(),
        type: CommunityChannelType.VOICE.valueOf(),
      },
    );
    const channel = community.getVoiceChannel(channelId);

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        channel.getId(),
      ),
      message.moderationLog,
      {
        name: message.name.valueOf(),
        type: CommunityChannelType.VOICE.valueOf(),
      },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return channel;
  }
}
