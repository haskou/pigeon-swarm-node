import { MessagesReadMarkMessage } from '@app/contexts/conversations/application/mark-messages-read/messages/MessagesReadMarkMessage';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { MessageReadProofVerifier } from '@app/contexts/conversations/application/verify-message-read-proof/MessageReadProofVerifier';
import { MessageReadProofVerifyMessage } from '@app/contexts/conversations/application/verify-message-read-proof/messages/MessageReadProofVerifyMessage';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { networkFanoutSuppression } from '@app/shared/infrastructure/messageBus/NetworkFanoutSuppression';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class MarkMessagesReadWhenAnnounced extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.mark-messages-read-when-announced';

  private readonly readProofVerifier = new MessageReadProofVerifier();

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: MessagesReadRegistrar,
  ) {
    super(eventConsumer);
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessagesWereReadEvent;
  }

  public get eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const conversationId = event.aggregateId;
    const readerIdentityId = String(event.attributes.readerIdentityId);
    const messageId = String(event.attributes.messageId);
    const readProof = event.attributes.readProof;

    const now = Date.now();
    const verified = this.readProofVerifier.verify(
      new MessageReadProofVerifyMessage(
        conversationId,
        readerIdentityId,
        messageId,
        readProof,
      ),
    );

    if (!verified || !MessageReadProof.isFresh(verified.claim, now)) {
      return;
    }

    let accepted: boolean;

    try {
      accepted = await this.registrar.register(
        new MessagesReadMarkMessage(
          conversationId,
          readerIdentityId,
          messageId,
          verified.proof,
        ),
      );
    } catch (error) {
      if (!(error instanceof OneToOneConversationMessagesNotReplicatedError)) {
        throw error;
      }

      accepted = false;
    }

    // The store refused this marker as stale, or the conversation is one-to-one
    // and its receipts travel only through mailboxes. Keep the receipt off the
    // WebSocket fanout that runs after the handlers. Duplicates and unknown
    // messages still fan out.
    if (!accepted) {
      networkFanoutSuppression.add(event);
    }
  }

  public get queueName(): string {
    return MarkMessagesReadWhenAnnounced.QUEUE_NAME;
  }
}
