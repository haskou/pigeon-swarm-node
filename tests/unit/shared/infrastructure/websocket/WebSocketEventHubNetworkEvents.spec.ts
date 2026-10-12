import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { WebSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { signedReadReceipt } from '../../../contexts/conversations/support/signedReadReceipt';

class OtherEvent extends DomainEvent {
  public eventName(): string {
    return 'tests.v1.other';
  }
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('WebSocketEventHub.publishFromNetwork', () => {
  const call = new CallStartedEvent('call-1', {});

  function build(attest: jest.Mock): {
    hub: WebSocketEventHub;
    publish: jest.SpyInstance;
  } {
    const hub = new WebSocketEventHub();
    const publish = jest.spyOn(hub, 'publish').mockImplementation();

    (
      hub as unknown as { callEventAttestor: { attest: jest.Mock } }
    ).callEventAttestor = { attest };

    return { hub, publish };
  }

  it('publishes a call event only after it is attested, as the attested event', async () => {
    const attested = new CallStartedEvent('call-1', { rebuilt: true });
    const { hub, publish } = build(jest.fn().mockResolvedValue(attested));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).toHaveBeenCalledWith([attested]);
  });

  it('drops a call event that cannot be attested', async () => {
    const { hub, publish } = build(jest.fn().mockResolvedValue(undefined));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).not.toHaveBeenCalled();
  });

  it('drops a call event when attestation fails', async () => {
    const { hub, publish } = build(jest.fn().mockRejectedValue(new Error('x')));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes non call events immediately', () => {
    const attest = jest.fn();
    const { hub, publish } = build(attest);
    const other = new OtherEvent('x', {});

    hub.publishFromNetwork([other]);

    expect(publish).toHaveBeenCalledWith([other]);
    expect(attest).not.toHaveBeenCalled();
  });
});

describe('WebSocketEventHub.publishFromNetwork read receipts', () => {
  const conversationId = 'one-to-one:conversation-1';
  const messageId = 'message-1';

  function build(): { hub: WebSocketEventHub; publish: jest.SpyInstance } {
    const hub = new WebSocketEventHub();
    const publish = jest.spyOn(hub, 'publish').mockImplementation();

    return { hub, publish };
  }

  async function receiptFrom(
    keyPair: KeyPair,
    proofMessageId = messageId,
    timestamp?: number,
  ): Promise<ConversationMessagesWereReadEvent> {
    return new ConversationMessagesWereReadEvent(conversationId, {
      messageId,
      networkId: 'network-1',
      participantIds: [],
      readProof: await signedReadReceipt({
        conversationId,
        keyPair,
        messageId: proofMessageId,
        timestamp,
      }),
      readerIdentityId: keyPair.toPrimitives().publicKey,
    });
  }

  it('publishes a read receipt that its reader signed', async () => {
    const { hub, publish } = build();
    const receipt = await receiptFrom(await KeyPair.generate());

    hub.publishFromNetwork([receipt]);

    expect(publish).toHaveBeenCalledWith([receipt]);
  });

  it('drops a read receipt without a reader signature', async () => {
    const { hub, publish } = build();
    const keyPair = await KeyPair.generate();

    hub.publishFromNetwork([
      new ConversationMessagesWereReadEvent(conversationId, {
        messageId,
        networkId: 'network-1',
        participantIds: [],
        readerIdentityId: keyPair.toPrimitives().publicKey,
      }),
    ]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('drops a read receipt whose signed proof names another message', async () => {
    const { hub, publish } = build();
    const receipt = await receiptFrom(await KeyPair.generate(), 'message-2');

    hub.publishFromNetwork([receipt]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('drops a read receipt claimed for an identity that did not sign it', async () => {
    const { hub, publish } = build();
    const attacker = await KeyPair.generate();
    const victim = await KeyPair.generate();
    const forged = new ConversationMessagesWereReadEvent(conversationId, {
      messageId,
      networkId: 'network-1',
      participantIds: [],
      readProof: await signedReadReceipt({
        conversationId,
        keyPair: attacker,
        messageId,
      }),
      readerIdentityId: victim.toPrimitives().publicKey,
    });

    hub.publishFromNetwork([forged]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('drops a read receipt signed outside the freshness window', async () => {
    const { hub, publish } = build();
    const stale = await receiptFrom(
      await KeyPair.generate(),
      messageId,
      Date.now() - MessageReadProof.MAX_AGE_MS - 1,
    );

    hub.publishFromNetwork([stale]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes a late read receipt that is still inside the freshness window', async () => {
    const { hub, publish } = build();
    const late = await receiptFrom(
      await KeyPair.generate(),
      messageId,
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    );

    hub.publishFromNetwork([late]);

    expect(publish).toHaveBeenCalledWith([late]);
  });
});
