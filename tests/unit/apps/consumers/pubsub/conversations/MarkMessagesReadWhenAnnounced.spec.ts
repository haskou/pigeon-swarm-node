import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { networkFanoutSuppression } from '@app/shared/infrastructure/messageBus/NetworkFanoutSuppression';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { signedReadReceipt } from '../../../../contexts/conversations/support/signedReadReceipt';

describe('MarkMessagesReadWhenAnnounced', () => {
  const conversationId = 'conversation-1';
  const messageId = `${conversationId}:1781121453305:client`;

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

  it('should suppress fanout of a receipt the store refused as stale', async () => {
    const registrar = mock<MessagesReadRegistrar>();
    const consumer = new MarkMessagesReadWhenAnnounced(
      mock<DomainEventConsumer>(),
      registrar,
    );
    const event = await receiptEvent();

    registrar.register.mockResolvedValue(false);

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
    expect(networkFanoutSuppression.has(event)).toBe(true);
  });

  it('should keep fanout of a receipt the store accepted', async () => {
    const registrar = mock<MessagesReadRegistrar>();
    const consumer = new MarkMessagesReadWhenAnnounced(
      mock<DomainEventConsumer>(),
      registrar,
    );
    const event = await receiptEvent();

    registrar.register.mockResolvedValue(true);

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
    expect(networkFanoutSuppression.has(event)).toBe(false);
  });

  it('should not register a receipt signed outside the freshness window', async () => {
    const registrar = mock<MessagesReadRegistrar>();
    const consumer = new MarkMessagesReadWhenAnnounced(
      mock<DomainEventConsumer>(),
      registrar,
    );
    const event = await receiptEvent(
      Date.now() - MessageReadProof.MAX_AGE_MS - 1,
    );

    await consumer.handler(event);

    expect(registrar.register).not.toHaveBeenCalled();
  });

  it('should register a late receipt that is still inside the freshness window', async () => {
    const registrar = mock<MessagesReadRegistrar>();
    const consumer = new MarkMessagesReadWhenAnnounced(
      mock<DomainEventConsumer>(),
      registrar,
    );
    const event = await receiptEvent(Date.now() - 3 * 24 * 60 * 60 * 1000);

    registrar.register.mockResolvedValue(true);

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
  });
});
