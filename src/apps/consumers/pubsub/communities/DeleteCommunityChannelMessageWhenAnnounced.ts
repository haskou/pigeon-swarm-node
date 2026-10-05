import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { assert } from '@haskou/value-objects';

import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class DeleteCommunityMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.delete-community-channel-message-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return DeleteCommunityMessageWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageWasDeletedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageWasDeletedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  private async resolveCommunity(
    snapshot: ReturnType<Community['toPrimitives']>,
  ): Promise<Community> {
    return (
      (await this.communityRepository.findById(new CommunityId(snapshot.id))) ??
      Community.fromPrimitives(snapshot)
    );
  }

  public async handler(event: DomainEvent): Promise<void> {
    if (!isCommunityPrimitive(event.attributes.community)) {
      return;
    }

    const deletedByIdentityId = String(event.attributes.deletedByIdentityId);

    if (!deletedByIdentityId || !event.attributes.mutationProof) {
      return;
    }

    const canonical = await this.resolveCommunity(event.attributes.community);
    const community = Community.fromPrimitives(event.attributes.community);
    const communityId = new CommunityId(
      String(event.attributes.communityId || event.aggregateId),
    );
    const channelId = new CommunityChannelId(
      String(event.attributes.channelId),
    );
    const targetMessageId = new CommunityChannelMessageId(
      String(event.attributes.targetMessageId),
    );
    const actorIdentityId = new IdentityId(deletedByIdentityId);
    const targetMessage = await this.messageRepository.findById(
      communityId,
      channelId,
      targetMessageId,
    );

    if (!community.isIdentifiedBy(communityId)) {
      return;
    }

    assert(targetMessage, new CommunityChannelMessageNotFoundError());
    const proof = PublicMutationProof.fromPrimitives(
      event.attributes.mutationProof,
    );

    community.deleteChannelMessage(
      actorIdentityId,
      targetMessage,
      channelId,
      proof,
    );

    try {
      await this.messageRepository.delete(
        communityId,
        channelId,
        targetMessageId,
        targetMessage.getAuthorIdentityId(),
        proof,
      );
    } catch (error) {
      if (
        error instanceof InvalidPublicMutationError ||
        error instanceof StalePublicMutationError
      ) {
        return;
      }

      throw error;
    }

    await this.communityRepository.save(canonical);
  }
}
