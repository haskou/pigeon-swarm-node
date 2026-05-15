import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

type MessageCandidate = {
  messageId: string;
};

type ReactionCandidate = {
  authorId: string;
  createdAt: number;
  emoji: string;
  messageId: string;
};

export default class RegisterMessagesWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-messages-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
    private readonly reactionRegistrar: MessageReactionRegistrar,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {
    super(consumer);
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
      await this.registrar.register(
        new RegisterConversationMessage(event.aggregateId, candidate.messageId),
      );
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
