import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage as RegisterConversationMetadataMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { MessageCandidate } from './types/MessageCandidate';
import { ReactionCandidate } from './types/ReactionCandidate';

type ConversationMetadataCandidate = {
  id: string;
  name?: string;
  networkId: string;
  participantIds: string[];
  type: string;
};

export default class RegisterMessagesWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-messages-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
    private readonly reactionRegistrar: MessageReactionRegistrar,
    private readonly conversationRegistrar: ConversationRegistrar,
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

  private isRecord(candidate: unknown): candidate is Record<string, unknown> {
    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      !Array.isArray(candidate)
    );
  }

  private isStringArray(candidate: unknown): candidate is string[] {
    return (
      Array.isArray(candidate) &&
      candidate.every((item) => typeof item === 'string')
    );
  }

  private isConversationMetadataCandidate(
    candidate: unknown,
  ): candidate is ConversationMetadataCandidate {
    if (!this.isRecord(candidate)) {
      return false;
    }

    return (
      typeof candidate.id === 'string' &&
      typeof candidate.networkId === 'string' &&
      typeof candidate.type === 'string' &&
      this.isStringArray(candidate.participantIds) &&
      (candidate.name === undefined || typeof candidate.name === 'string')
    );
  }

  private conversationMetadataFrom(
    event: DomainEvent,
  ): RegisterConversationMetadataMessage | undefined {
    const candidate = event.attributes.conversation;

    if (!this.isConversationMetadataCandidate(candidate)) {
      return undefined;
    }

    if (candidate.id !== event.aggregateId) {
      throw new Error(
        'Conversation sync metadata does not match aggregate id.',
      );
    }

    return new RegisterConversationMetadataMessage({
      conversationId: candidate.id,
      name: candidate.name,
      networkId: candidate.networkId,
      participantIds: candidate.participantIds,
      type: candidate.type,
    });
  }

  private messageCandidatesFrom(event: DomainEvent): MessageCandidate[] {
    return Array.isArray(event.attributes.messageCandidates)
      ? event.attributes.messageCandidates.filter((candidate) =>
          this.isMessageCandidate(candidate),
        )
      : [];
  }

  private reactionCandidatesFrom(event: DomainEvent): ReactionCandidate[] {
    return Array.isArray(event.attributes.reactionCandidates)
      ? event.attributes.reactionCandidates.filter((candidate) =>
          this.isReactionCandidate(candidate),
        )
      : [];
  }

  private async registerMessagesFrom(
    event: DomainEvent,
    candidates: MessageCandidate[],
  ): Promise<number> {
    let registeredMessages = 0;

    for (const candidate of candidates) {
      if (!candidate.externalIdentifier) {
        Kernel.logger?.warn?.(
          `Conversation sync ignored message candidate without IPFS CID: conversationId=${event.aggregateId} messageId=${candidate.messageId} requestId=${String(event.attributes.requestId || '')}`,
        );

        continue;
      }

      const message = new RegisterConversationMessage(
        event.aggregateId,
        candidate.messageId,
        candidate.externalIdentifier,
      );

      if (candidate.message) {
        Kernel.logger?.warn?.(
          `Conversation sync ignored embedded IPFS message payload: conversationId=${event.aggregateId} messageId=${candidate.messageId} requestId=${String(event.attributes.requestId || '')}`,
        );
      }

      await this.registrar.register(message);
      registeredMessages++;
    }

    return registeredMessages;
  }

  private async registerReactionsFrom(
    event: DomainEvent,
    candidates: ReactionCandidate[],
  ): Promise<number> {
    let registeredReactions = 0;

    for (const candidate of candidates) {
      await this.reactionRegistrar.register(
        new RegisterMessageReaction(
          event.aggregateId,
          candidate.messageId,
          candidate.authorId,
          candidate.emoji,
          candidate.createdAt,
        ),
      );
      registeredReactions++;
    }

    return registeredReactions;
  }

  private logAppliedSync(
    event: DomainEvent,
    hasMetadata: boolean,
    registeredMessages: number,
    registeredReactions: number,
  ): void {
    if (hasMetadata || registeredMessages > 0 || registeredReactions > 0) {
      Kernel.logger?.info?.(
        `Conversation sync applied: conversationId=${event.aggregateId} metadata=${hasMetadata ? 'true' : 'false'} messages=${registeredMessages} reactions=${registeredReactions}`,
      );
    }
  }

  public async handler(event: DomainEvent): Promise<void> {
    this.tracker.markAvailable(
      'conversation',
      event.aggregateId,
      event.attributes.requestId
        ? String(event.attributes.requestId)
        : undefined,
    );

    const conversationMetadata = this.conversationMetadataFrom(event);

    if (conversationMetadata) {
      await this.conversationRegistrar.register(conversationMetadata);
    }

    const registeredMessages = await this.registerMessagesFrom(
      event,
      this.messageCandidatesFrom(event),
    );
    const registeredReactions = await this.registerReactionsFrom(
      event,
      this.reactionCandidatesFrom(event),
    );

    this.logAppliedSync(
      event,
      conversationMetadata !== undefined,
      registeredMessages,
      registeredReactions,
    );
  }
}
