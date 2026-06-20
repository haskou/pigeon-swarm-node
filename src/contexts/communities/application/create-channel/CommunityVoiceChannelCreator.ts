import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunityVoiceChannel } from '../../domain/entities/channels/CommunityVoiceChannel';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
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
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );
    const channel = community.addVoiceChannel(
      message.actorIdentityId,
      message.name,
    );

    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        channel.getId(),
      ),
      { name: message.name.valueOf(), type: 'voice' },
    );

    return channel;
  }
}
