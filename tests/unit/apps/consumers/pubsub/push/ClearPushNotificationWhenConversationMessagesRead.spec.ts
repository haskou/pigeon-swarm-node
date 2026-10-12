import ClearPushNotificationWhenConversationMessagesRead from '@app/apps/consumers/pubsub/push/ClearPushNotificationWhenConversationMessagesRead';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { signedReadReceipt } from '../../../../contexts/conversations/support/signedReadReceipt';

describe('ClearPushNotificationWhenConversationMessagesRead', () => {
  const conversationId = 'conversation-1';
  const messageId = `${conversationId}:1781121453305:client`;
  const day = 24 * 60 * 60 * 1000;

  async function receiptEvent(
    timestamp?: number,
  ): Promise<ConversationMessagesWereReadEvent> {
    const keyPair = await KeyPair.generate();

    return new ConversationMessagesWereReadEvent(conversationId, {
      messageId,
      networkId: 'network-1',
      participantIds: [],
      readProof: await signedReadReceipt({
        conversationId,
        keyPair,
        messageId,
        timestamp,
      }),
      readerIdentityId: keyPair.toPrimitives().publicKey,
    });
  }

  it('should dispatch the clearing of a late receipt inside the freshness window', async () => {
    const dispatcher = mock<PushNotificationDispatcher>();
    const consumer = new ClearPushNotificationWhenConversationMessagesRead(
      mock<DomainEventConsumer>(),
      dispatcher,
    );
    const event = await receiptEvent(Date.now() - 3 * day);

    await consumer.handler(event);

    expect(dispatcher.dispatch).toHaveBeenCalledWith(event);
  });

  it('should not dispatch a receipt signed outside the freshness window', async () => {
    const dispatcher = mock<PushNotificationDispatcher>();
    const consumer = new ClearPushNotificationWhenConversationMessagesRead(
      mock<DomainEventConsumer>(),
      dispatcher,
    );
    const event = await receiptEvent(
      Date.now() - MessageReadProof.MAX_AGE_MS - 1,
    );

    await consumer.handler(event);

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
