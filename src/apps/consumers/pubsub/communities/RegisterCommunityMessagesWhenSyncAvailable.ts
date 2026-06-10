import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import CommunityMessageRegistrar from './CommunityChannelMessageCandidateRegistrar';
import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

// eslint-disable-next-line max-len
export default class RegisterCommunityMessagesWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-messages-when-sync-available';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
    private readonly tracker: SyncResponseSuppressionTracker,
    private readonly messageRegistrar: CommunityMessageRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterCommunityMessagesWhenSyncAvailable.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunitySyncAvailableEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunitySyncAvailableEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  private markSyncAvailable(event: DomainEvent): void {
    this.tracker.markAvailable(
      'community',
      String(event.attributes.communityId || event.aggregateId),
      event.attributes.requestId
        ? String(event.attributes.requestId)
        : undefined,
    );
  }

  private communityFrom(event: DomainEvent): Community | undefined {
    if (!isCommunityPrimitive(event.attributes.community)) {
      return undefined;
    }

    return Community.fromPrimitives(event.attributes.community);
  }

  private async registerMessages(
    community: Community,
    event: DomainEvent,
  ): Promise<Set<string>> {
    const candidates = Array.isArray(event.attributes.messageCandidates)
      ? event.attributes.messageCandidates
      : [];
    const acceptedMessageIds = new Set<string>();

    for (const candidate of candidates) {
      if (!isCommunityChannelMessagePrimitive(candidate)) {
        continue;
      }

      const message = await this.messageRegistrar.registerSent(
        community,
        candidate,
        acceptedMessageIds,
      );

      if (message) {
        acceptedMessageIds.add(candidate.id);
      }
    }

    return acceptedMessageIds;
  }

  private async hasReactionTarget(
    reaction: CommunityChannelMessageReaction,
    acceptedMessageIds: ReadonlySet<string>,
  ): Promise<boolean> {
    if (acceptedMessageIds.has(reaction.getMessageId().valueOf())) {
      return true;
    }

    return Boolean(
      await this.messageRepository.findById(
        reaction.getCommunityId(),
        reaction.getChannelId(),
        reaction.getMessageId(),
      ),
    );
  }

  private async registerReactions(
    community: Community,
    event: DomainEvent,
    acceptedMessageIds: ReadonlySet<string>,
  ): Promise<void> {
    const reactionCandidates = Array.isArray(
      event.attributes.reactionCandidates,
    )
      ? event.attributes.reactionCandidates
      : [];

    for (const candidate of reactionCandidates) {
      if (!isCommunityChannelMessageReactionPrimitive(candidate)) {
        continue;
      }

      const reaction =
        CommunityChannelMessageReaction.fromPrimitives(candidate);
      const authorIdentityId = new IdentityId(candidate.authorIdentityId);
      const channelId = new CommunityChannelId(candidate.channelId);
      const communityId = new CommunityId(candidate.communityId);

      if (!community.getId().isEqual(communityId)) {
        continue;
      }

      community.assertCanReactWithSticker(authorIdentityId, channelId);

      if (await this.hasReactionTarget(reaction, acceptedMessageIds)) {
        await this.reactionRepository.save(reaction);
      }
    }
  }

  public async handler(event: DomainEvent): Promise<void> {
    this.markSyncAvailable(event);
    const community = this.communityFrom(event);

    if (!community) {
      return;
    }

    const acceptedMessageIds = await this.registerMessages(community, event);

    await this.registerReactions(community, event, acceptedMessageIds);
    await this.communityRepository.save(community);
  }
}
