import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
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
