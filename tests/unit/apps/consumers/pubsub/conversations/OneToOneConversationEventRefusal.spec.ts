import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { networkFanoutSuppression } from '@app/shared/infrastructure/messageBus/NetworkFanoutSuppression';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { messageProof } from '../../../../contexts/conversations/support/messageProof';
import { signedReadReceipt } from '../../../../contexts/conversations/support/signedReadReceipt';

/**
 * One-to-one messages travel only through mailboxes. A peer that still
 * announces a one-to-one message-log record is refused, and the refused
 * announcement never reaches this node's WebSocket clients.
 */
describe('One-to-one conversation event refusal', () => {
  const conversationId = ConversationId.deterministic(
    'first-identity',
    'second-identity',
    'network-1',
  ).valueOf();
  const messageId = 'message-1';
  const authorId =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';

  function refusingMessageRegistrar(): ConversationMessageRegistrar {
    const registrar = mock<ConversationMessageRegistrar>();

    registrar.register.mockRejectedValue(
      new OneToOneConversationMessagesNotReplicatedError(),
    );

    return registrar;
  }

  function refusingReactionRegistrar(): MessageReactionRegistrar {
    const registrar = mock<MessageReactionRegistrar>();

    registrar.register.mockRejectedValue(
      new OneToOneConversationMessagesNotReplicatedError(),
    );
    registrar.unregister.mockRejectedValue(
      new OneToOneConversationMessagesNotReplicatedError(),
    );

    return registrar;
  }

  function reactionAttributes(): Record<string, unknown> {
    return {
      authorId,
      createdAt: 1780000000000,
      emoji: '👍',
      messageId,
      mutationProof: messageProof().toPrimitives(),
    };
  }

  it.each<[string, () => Consumer, () => DomainEvent]>([
    [
      'message sent',
      () =>
        new RegisterMessageWhenAnnounced(
          mock<DomainEventConsumer>(),
          refusingMessageRegistrar(),
        ),
      () =>
        new ConversationMessageWasSentEvent(conversationId, {
          messageId,
          mutationProof: messageProof().toPrimitives(),
        }),
    ],
    [
      'message edited',
      () =>
        new RegisterMessageEditionWhenAnnounced(
          mock<DomainEventConsumer>(),
          refusingMessageRegistrar(),
        ),
      () =>
        new ConversationMessageWasEditedEvent(conversationId, {
          messageId,
          mutationProof: messageProof().toPrimitives(),
        }),
    ],
    [
      'message deleted',
      () =>
        new RegisterMessageDeletionWhenAnnounced(
          mock<DomainEventConsumer>(),
          refusingMessageRegistrar(),
        ),
      () =>
        new ConversationMessageWasDeletedEvent(conversationId, {
          messageId,
          mutationProof: messageProof().toPrimitives(),
        }),
    ],
    [
      'reaction added',
      () =>
        new RegisterMessageReactionWhenAdded(
          mock<DomainEventConsumer>(),
          refusingReactionRegistrar(),
        ),
      () =>
        new ConversationMessageReactionWasAddedEvent(
          conversationId,
          reactionAttributes(),
        ),
    ],
    [
      'reaction removed',
      () =>
        new RegisterMessageReactionWhenRemoved(
          mock<DomainEventConsumer>(),
          refusingReactionRegistrar(),
        ),
      () =>
        new ConversationMessageReactionWasRemovedEvent(
          conversationId,
          reactionAttributes(),
        ),
    ],
  ])(
    'should refuse a one-to-one %s announcement without fanout',
    async (_announcement, consumer, event) => {
      const announced = event();

      await expect(consumer().handler(announced)).resolves.toBeUndefined();
      expect(networkFanoutSuppression.has(announced)).toBe(true);
    },
  );

  it('should refuse a one-to-one read announcement without fanout', async () => {
    const keyPair = await KeyPair.generate();
    const registrar = mock<MessagesReadRegistrar>();
    const announced = new ConversationMessagesWereReadEvent(conversationId, {
      messageId,
      networkId: 'network-1',
      participantIds: [],
      readerIdentityId: keyPair.toPrimitives().publicKey,
      readProof: await signedReadReceipt({
        conversationId,
        keyPair,
        messageId,
      }),
    });

    registrar.register.mockRejectedValue(
      new OneToOneConversationMessagesNotReplicatedError(),
    );

    await expect(
      new MarkMessagesReadWhenAnnounced(
        mock<DomainEventConsumer>(),
        registrar,
      ).handler(announced),
    ).resolves.toBeUndefined();
    expect(networkFanoutSuppression.has(announced)).toBe(true);
  });
});
