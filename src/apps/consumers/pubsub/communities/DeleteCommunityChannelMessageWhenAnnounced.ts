import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageDeletion } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageDeletion';
import { CommunityChannelMessageSignaturePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageSignaturePayload';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import CommunityChannelMessageSignatureDomainService from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { assert, Signature, Timestamp } from '@haskou/value-objects';

import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class DeleteCommunityMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.delete-community-channel-message-when-announced';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,

    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
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

  public async handler(event: DomainEvent): Promise<void> {
    if (!isCommunityPrimitive(event.attributes.community)) {
      return;
    }

    const deletedByIdentityId = String(event.attributes.deletedByIdentityId);
    const signature = String(event.attributes.signature || '');
    const createdAt = Number(event.attributes.createdAt);

    if (!deletedByIdentityId || !signature || !createdAt) {
      return;
    }

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

    if (!community.getId().isEqual(communityId)) {
      return;
    }

    assert(targetMessage, new CommunityChannelMessageNotFoundError());
    community.deleteChannelMessage(
      actorIdentityId,
      targetMessage,
      channelId,
      new CommunityChannelMessageDeletion(
        new CommunityChannelMessageId(String(event.attributes.messageId)),
        new Signature(signature),
        new Timestamp(createdAt),
      ),
    );
    this.signatureService.assertValidSignature(
      actorIdentityId,
      CommunityChannelMessageSignaturePayload.fromPrimitives({
        actorIdentityId: actorIdentityId.valueOf(),
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        createdAt,
        id: String(event.attributes.messageId),
        targetMessageId: targetMessageId.valueOf(),
        type: 'deleted',
      }),
      new Signature(signature),
    );

    await this.messageRepository.delete(
      communityId,
      channelId,
      targetMessageId,
    );
    await this.communityRepository.save(community);
  }
}
