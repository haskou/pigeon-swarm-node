import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { WebSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { KeyPair } from '@haskou/value-objects';
import { WebSocket } from 'ws';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

class TestIdentityDomainEvent extends DomainEvent {
  public eventName(): string {
    return 'identities.v1.identity.was_updated';
  }
}

class TestNodeDomainEvent extends DomainEvent {
  public eventName(): string {
    return 'nodes.v1.node.heartbeat.was_sent';
  }
}

describe('WebSocketEventHub', () => {
  it('sends an ack when registering a websocket client', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient();

    hub.register(identityId, client);

    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({
        identityId: identityId.valueOf(),
        type: 'connection_ack',
      }),
    );
  });

  it('answers identity heartbeat messages on the same websocket client', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient();
    const now = 1770000000000;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    hub.register(identityId, client);
    const messageHandler = getClientMessageHandler(client);

    jest.clearAllMocks();
    messageHandler(Buffer.from(JSON.stringify({ type: 'identity_heartbeat' })));

    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({
        identityId: identityId.valueOf(),
        timestamp: now,
        type: 'heartbeat_ack',
      }),
    );
  });

  it('ignores unknown websocket client messages', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient();

    hub.register(identityId, client);
    const messageHandler = getClientMessageHandler(client);

    jest.clearAllMocks();
    messageHandler(Buffer.from(JSON.stringify({ type: 'unknown' })));
    messageHandler(Buffer.from('not-json'));

    expect(client.send).not.toHaveBeenCalled();
  });

  it('relays conversation typing indicators to other participants', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const recipientClient = buildClient();
    const otherClient = buildClient();
    const now = 1770000000000;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockWebSocketMongo({
      conversations: {
        findOne: jest.fn().mockResolvedValue({
          participantIds: [
            senderIdentityId.valueOf(),
            recipientIdentityId.valueOf(),
          ],
        }),
      },
    });
    hub.register(senderIdentityId, senderClient);
    hub.register(recipientIdentityId, recipientClient);
    hub.register(otherIdentityId, otherClient);
    const messageHandler = getClientMessageHandler(senderClient);

    jest.clearAllMocks();
    messageHandler(
      Buffer.from(
        JSON.stringify({
          active: true,
          conversationId: 'conversation-id',
          scope: 'conversation',
          type: 'typing',
        }),
      ),
    );
    await flushPromises();

    expect(recipientClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        active: true,
        conversationId: 'conversation-id',
        identityId: senderIdentityId.valueOf(),
        scope: 'conversation',
        timestamp: now,
        type: 'typing',
      }),
    );
    expect(senderClient.send).not.toHaveBeenCalled();
    expect(otherClient.send).not.toHaveBeenCalled();
  });

  it('relays community text channel typing indicators to other members', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const recipientClient = buildClient();
    const now = 1770000000000;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockWebSocketMongo({
      communities: {
        findOne: jest.fn().mockResolvedValue({
          memberIds: [senderIdentityId.valueOf(), recipientIdentityId.valueOf()],
        }),
      },
    });
    hub.register(senderIdentityId, senderClient);
    hub.register(recipientIdentityId, recipientClient);
    const messageHandler = getClientMessageHandler(senderClient);

    jest.clearAllMocks();
    messageHandler(
      Buffer.from(
        JSON.stringify({
          active: false,
          channelId: 'channel-id',
          communityId: 'community-id',
          scope: 'community_channel',
          type: 'typing',
        }),
      ),
    );
    await flushPromises();

    expect(recipientClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        active: false,
        channelId: 'channel-id',
        communityId: 'community-id',
        identityId: senderIdentityId.valueOf(),
        scope: 'community_channel',
        timestamp: now,
        type: 'typing',
      }),
    );
    expect(senderClient.send).not.toHaveBeenCalled();
  });

  it('ignores typing indicators when the websocket identity cannot access the scope', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const recipientClient = buildClient();

    mockWebSocketMongo({
      conversations: {
        findOne: jest.fn().mockResolvedValue(undefined),
      },
    });
    hub.register(senderIdentityId, senderClient);
    hub.register(recipientIdentityId, recipientClient);
    const messageHandler = getClientMessageHandler(senderClient);

    jest.clearAllMocks();
    messageHandler(
      Buffer.from(
        JSON.stringify({
          active: true,
          conversationId: 'conversation-id',
          scope: 'conversation',
          type: 'typing',
        }),
      ),
    );
    await flushPromises();

    expect(senderClient.send).not.toHaveBeenCalled();
    expect(recipientClient.send).not.toHaveBeenCalled();
  });

  it('ignores typing indicators with non-string conversation ids', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const conversations = {
      findOne: jest.fn(),
    };

    mockWebSocketMongo({ conversations });
    hub.register(senderIdentityId, senderClient);
    const messageHandler = getClientMessageHandler(senderClient);

    jest.clearAllMocks();
    messageHandler(
      Buffer.from(
        JSON.stringify({
          active: true,
          conversationId: { $ne: null },
          scope: 'conversation',
          type: 'typing',
        }),
      ),
    );
    await flushPromises();

    expect(conversations.findOne).not.toHaveBeenCalled();
    expect(senderClient.send).not.toHaveBeenCalled();
  });

  it('ignores typing indicators with non-string community channel ids', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const communities = {
      findOne: jest.fn(),
    };

    mockWebSocketMongo({ communities });
    hub.register(senderIdentityId, senderClient);
    const messageHandler = getClientMessageHandler(senderClient);

    jest.clearAllMocks();
    messageHandler(
      Buffer.from(
        JSON.stringify({
          active: true,
          channelId: { $ne: null },
          communityId: 'community-id',
          scope: 'community_channel',
          type: 'typing',
        }),
      ),
    );
    await flushPromises();

    expect(communities.findOne).not.toHaveBeenCalled();
    expect(senderClient.send).not.toHaveBeenCalled();
  });

  it('broadcasts node-wide events to connected websocket clients', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient();
    const event = new TestNodeDomainEvent('node-id', { value: 'test-value' });

    hub.register(identityId, client);
    jest.clearAllMocks();
    hub.publish([event]);

    expect(client.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
  });

  it('sends addressed events only to matching websocket clients', async () => {
    const hub = new WebSocketEventHub();
    const recipientIdentityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const recipientClient = buildClient();
    const otherClient = buildClient();
    const event = new TestDomainEvent('aggregate-id', {
      recipientIdentityId: recipientIdentityId.valueOf(),
    });

    hub.register(recipientIdentityId, recipientClient);
    hub.register(otherIdentityId, otherClient);
    jest.clearAllMocks();

    hub.publish([event]);

    expect(recipientClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
    expect(otherClient.send).not.toHaveBeenCalled();
  });

  it('sends conversation participant events only to participants', async () => {
    const hub = new WebSocketEventHub();
    const participantIdentityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const participantClient = buildClient();
    const otherClient = buildClient();
    const event = new TestDomainEvent('conversation-id', {
      participantIds: [participantIdentityId.valueOf()],
    });

    hub.register(participantIdentityId, participantClient);
    hub.register(otherIdentityId, otherClient);
    jest.clearAllMocks();

    hub.publish([event]);

    expect(participantClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
    expect(otherClient.send).not.toHaveBeenCalled();
  });

  it('sends presence updates only to the updated identity', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const identityClient = buildClient();
    const otherClient = buildClient();
    const event = new TestDomainEvent(identityId.valueOf(), {
      identityId: identityId.valueOf(),
      networkIds: ['network-id'],
      status: 'available',
    });

    jest
      .spyOn(event, 'eventName')
      .mockReturnValue('presence.v1.identity_presence.was_updated');
    hub.register(identityId, identityClient);
    hub.register(otherIdentityId, otherClient);
    jest.clearAllMocks();

    hub.publish([event]);

    expect(identityClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
    expect(otherClient.send).not.toHaveBeenCalled();
  });

  it('sends call signals only to the signal recipient', async () => {
    const hub = new WebSocketEventHub();
    const senderIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const otherParticipantIdentityId = await generateIdentityId();
    const senderClient = buildClient();
    const recipientClient = buildClient();
    const otherParticipantClient = buildClient();
    const event = new TestDomainEvent('call-id', {
      participantIds: [
        senderIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
        otherParticipantIdentityId.valueOf(),
      ],
      recipientIdentityId: recipientIdentityId.valueOf(),
      senderIdentityId: senderIdentityId.valueOf(),
    });

    jest
      .spyOn(event, 'eventName')
      .mockReturnValue('calls.v1.signal.sent');
    hub.register(senderIdentityId, senderClient);
    hub.register(recipientIdentityId, recipientClient);
    hub.register(otherParticipantIdentityId, otherParticipantClient);
    jest.clearAllMocks();

    hub.publish([event]);

    expect(recipientClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
    expect(senderClient.send).not.toHaveBeenCalled();
    expect(otherParticipantClient.send).not.toHaveBeenCalled();
  });

  it('emits conversation call events as timeline system items', async () => {
    const hub = new WebSocketEventHub();
    const participantIdentityId = await generateIdentityId();
    const participantClient = buildClient();
    const event = new TestDomainEvent('call-id', {
      callId: 'call-id',
      createdAt: 1770000000000,
      endedAt: 1770000043000,
      endedByIdentityId: participantIdentityId.valueOf(),
      participantIds: [participantIdentityId.valueOf()],
      scope: {
        conversationId: 'one-to-one:conversation-id',
        type: 'conversation',
      },
    });

    jest.spyOn(event, 'eventName').mockReturnValue('calls.v1.call.ended');
    hub.register(participantIdentityId, participantClient);
    jest.clearAllMocks();

    hub.publish([event]);

    const realtimeMessages = (participantClient.send as jest.Mock).mock.calls
      .map(([message]) => JSON.parse(message as string));
    const callEventMessage = realtimeMessages.find(
      (message) =>
        message.event.type === 'conversations.v1.call.event.was_recorded',
    );

    expect(callEventMessage).toMatchObject({
      event: {
        aggregate_id: 'one-to-one:conversation-id',
        attributes: {
          message: {
            actorIdentityId: participantIdentityId.valueOf(),
            callEventType: 'ended',
            callId: 'call-id',
            conversationId: 'one-to-one:conversation-id',
            createdAt: 1770000043000,
            durationMs: 43000,
            id: `call-event:call-id:ended:${participantIdentityId.valueOf()}`,
            type: 'call_event',
          },
          participantIds: [participantIdentityId.valueOf()],
        },
        event_id: `${event.eventId}:conversation-call-event:call-event:call-id:ended:${participantIdentityId.valueOf()}`,
        occurred_on: event.occurredOn.getTime(),
        type: 'conversations.v1.call.event.was_recorded',
      },
      type: 'domain_event',
    });
  });

  it('emits missed call events with the missed participant as actor', async () => {
    const hub = new WebSocketEventHub();
    const creatorIdentityId = await generateIdentityId();
    const missedIdentityId = await generateIdentityId();
    const creatorClient = buildClient();
    const missedClient = buildClient();
    const event = new TestDomainEvent('call-id', {
      callId: 'call-id',
      createdAt: 1770000000000,
      creatorIdentityId: creatorIdentityId.valueOf(),
      missedIdentityIds: [missedIdentityId.valueOf()],
      participantIds: [creatorIdentityId.valueOf(), missedIdentityId.valueOf()],
      participants: [
        {
          identityId: creatorIdentityId.valueOf(),
          joinedAt: 1770000000000,
          status: 'joined',
        },
        {
          identityId: missedIdentityId.valueOf(),
          missedAt: 1770000060000,
          status: 'missed',
        },
      ],
      scope: {
        conversationId: 'one-to-one:conversation-id',
        type: 'conversation',
      },
    });

    jest.spyOn(event, 'eventName').mockReturnValue('calls.v1.call.missed');
    hub.register(creatorIdentityId, creatorClient);
    hub.register(missedIdentityId, missedClient);
    jest.clearAllMocks();

    hub.publish([event]);

    const realtimeMessages = (creatorClient.send as jest.Mock).mock.calls.map(
      ([message]) => JSON.parse(message as string),
    );
    const callEventMessage = realtimeMessages.find(
      (message) =>
        message.event.type === 'conversations.v1.call.event.was_recorded',
    );

    expect(callEventMessage).toMatchObject({
      event: {
        aggregate_id: 'one-to-one:conversation-id',
        attributes: {
          message: {
            actorIdentityId: missedIdentityId.valueOf(),
            callEventType: 'missed',
            callId: 'call-id',
            conversationId: 'one-to-one:conversation-id',
            createdAt: 1770000060000,
            durationMs: 60000,
            id: `call-event:call-id:missed:${missedIdentityId.valueOf()}`,
            type: 'call_event',
          },
        },
        type: 'conversations.v1.call.event.was_recorded',
      },
      type: 'domain_event',
    });
  });

  it('does not emit community channel call events as timeline system items', async () => {
    const hub = new WebSocketEventHub();
    const participantIdentityId = await generateIdentityId();
    const participantClient = buildClient();
    const event = new TestDomainEvent('call-id', {
      callId: 'call-id',
      createdAt: 1770000000000,
      endedAt: 1770000043000,
      endedByIdentityId: participantIdentityId.valueOf(),
      participantIds: [participantIdentityId.valueOf()],
      scope: {
        channelId: 'channel-id',
        communityId: 'community-id',
        type: 'community_channel',
      },
    });

    jest.spyOn(event, 'eventName').mockReturnValue('calls.v1.call.ended');
    hub.register(participantIdentityId, participantClient);
    jest.clearAllMocks();

    hub.publish([event]);

    const realtimeMessages = (participantClient.send as jest.Mock).mock.calls
      .map(([message]) => JSON.parse(message as string));

    expect(
      realtimeMessages.some(
        (message) =>
          message.event.type === 'communities.v1.call.event.was_recorded',
      ),
    ).toBe(false);
  });

  it('sends identity aggregate events only to that identity', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const identityClient = buildClient();
    const otherClient = buildClient();
    const event = new TestIdentityDomainEvent(identityId.valueOf());

    hub.register(identityId, identityClient);
    hub.register(otherIdentityId, otherClient);
    jest.clearAllMocks();

    hub.publish([event]);

    expect(identityClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      }),
    );
    expect(otherClient.send).not.toHaveBeenCalled();
  });

  it('does not broadcast events without a related identity', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient();
    const event = new TestDomainEvent('aggregate-id');

    hub.register(identityId, client);
    jest.clearAllMocks();
    hub.publish([event]);

    expect(client.send).not.toHaveBeenCalled();
  });

  it('does not send events to closed websocket clients', async () => {
    const hub = new WebSocketEventHub();
    const identityId = await generateIdentityId();
    const client = buildClient(WebSocket.CLOSED);
    const event = new TestDomainEvent('aggregate-id');

    hub.register(identityId, client);
    hub.publish([event]);

    expect(client.send).not.toHaveBeenCalled();
  });
});

async function generateIdentityId(): Promise<IdentityId> {
  const keyPair = await KeyPair.generate();

  return new IdentityId(keyPair.toPrimitives().publicKey);
}

function buildClient(readyState: number = WebSocket.OPEN): WebSocket {
  return {
    on: jest.fn(),
    readyState,
    send: jest.fn(),
  } as unknown as WebSocket;
}

function getClientMessageHandler(client: WebSocket): (message: Buffer) => void {
  const messageHandler = (client.on as jest.Mock).mock.calls.find(
    ([eventName]) => eventName === 'message',
  )?.[1];

  if (!messageHandler) {
    throw new Error('Message handler not registered.');
  }

  return messageHandler;
}

function mockWebSocketMongo(
  collections: Record<string, { findOne: jest.Mock }>,
): void {
  const mongo = {
    getCollection: jest.fn(async (collectionName: string) => {
      const collection = collections[collectionName];

      if (!collection) {
        throw new Error(`Unexpected collection ${collectionName}.`);
      }

      return collection;
    }),
  };

  (Kernel as unknown as { _di: { getService: jest.Mock } })._di = {
    getService: jest.fn().mockReturnValue(mongo as unknown as MongoDB),
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
