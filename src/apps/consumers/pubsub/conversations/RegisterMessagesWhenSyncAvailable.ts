import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageFactory } from '@app/contexts/conversations/domain/MessageFactory';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { PrimitiveOf } from '@haskou/value-objects';

import { MessageCandidate } from './types/MessageCandidate';
import { ReactionCandidate } from './types/ReactionCandidate';

export default class RegisterMessagesWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-messages-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
    private readonly reactionRegistrar: MessageReactionRegistrar,
    _conversationRegistrar: ConversationRegistrar,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {
    super(consumer);
    void _conversationRegistrar;
  }

  public get queueName(): string {
    return RegisterMessagesWhenSyncAvailable.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationSyncAvailableEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationSyncAvailableEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  private isMessageCandidate(
    candidate: unknown,
  ): candidate is MessageCandidate {
    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      'messageId' in candidate &&
      typeof candidate.messageId === 'string'
    );
  }

  private isReactionCandidate(
    candidate: unknown,
  ): candidate is ReactionCandidate {
    if (typeof candidate !== 'object' || candidate === null) {
      return false;
    }

    const candidateRecord = candidate as Record<string, unknown>;

    return (
      typeof candidateRecord.authorId === 'string' &&
      typeof candidateRecord.createdAt === 'number' &&
      typeof candidateRecord.emoji === 'string' &&
      typeof candidateRecord.messageId === 'string'
    );
  }

  private messageFromCandidate(
    candidate: MessageCandidate,
  ): Message | undefined {
    if (
      candidate.message === undefined ||
      candidate.message === null ||
      typeof candidate.message !== 'object' ||
      Array.isArray(candidate.message)
    ) {
      return undefined;
    }

    return MessageFactory.fromPrimitives(
      candidate.message as PrimitiveOf<Message>,
    );
  }

  public async handler(event: DomainEvent): Promise<void> {
    this.tracker.markAvailable(
      'conversation',
      event.aggregateId,
      event.attributes.requestId
        ? String(event.attributes.requestId)
        : undefined,
    );
    const candidates = Array.isArray(event.attributes.messageCandidates)
      ? event.attributes.messageCandidates.filter((candidate) =>
          this.isMessageCandidate(candidate),
        )
      : [];

    for (const candidate of candidates) {
      const message = new RegisterConversationMessage(
        event.aggregateId,
        candidate.messageId,
      );
      const embeddedMessage = this.messageFromCandidate(candidate);

      if (embeddedMessage) {
        await this.registrar.registerCandidate(message, embeddedMessage);
      } else {
        await this.registrar.register(message);
      }
    }

    const reactionCandidates = Array.isArray(
      event.attributes.reactionCandidates,
    )
      ? event.attributes.reactionCandidates.filter((candidate) =>
          this.isReactionCandidate(candidate),
        )
      : [];

    for (const candidate of reactionCandidates) {
      await this.reactionRegistrar.register(
        new RegisterMessageReaction(
          event.aggregateId,
          candidate.messageId,
          candidate.authorId,
          candidate.emoji,
          candidate.createdAt,
        ),
      );
    }
  }
}
