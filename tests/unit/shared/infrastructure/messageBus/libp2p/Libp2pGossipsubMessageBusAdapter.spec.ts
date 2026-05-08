import DomainEvent from '@app/shared/domain/events/DomainEvent';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import { PubSubTransport } from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { mock, MockProxy } from 'jest-mock-extended';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_created';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

class OtherIdentityDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_updated';

  public eventName(): string {
    return OtherIdentityDomainEvent.EVENT_NAME;
  }
}

describe('Libp2pGossipsubAdapter', () => {
  let transport: MockProxy<PubSubTransport>;
  let adapter: Libp2pGossipsubAdapter;

  beforeEach(() => {
    transport = mock<PubSubTransport>();
    adapter = new Libp2pGossipsubAdapter(transport);
  });

  it('should publish domain events to pubsub topics', async () => {
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    await adapter.publish([event]);

    expect(transport.publish).toHaveBeenCalledWith(
      'pigeon-swarm.identities.v1.announcements',
      event.decode(),
    );
  });

  it('should consume pubsub payloads as domain events', async () => {
    const handler = jest.fn();
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    transport.subscribe.mockImplementation(async (_topic, callback) => {
      await callback(event.decode());
    });

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );

    expect(transport.subscribe).toHaveBeenCalledWith(
      'pigeon-swarm.identities.v1.announcements',
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(handler.mock.calls[0][0].toPrimitives).toBeUndefined();
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });

  it('should ignore other events published on the same context topic', async () => {
    const handler = jest.fn();
    const expectedEvent = new TestDomainEvent('aggregate-id');
    const otherEvent = new OtherIdentityDomainEvent('other-aggregate-id');

    transport.subscribe.mockImplementation(async (_topic, callback) => {
      await callback(otherEvent.decode());
      await callback(expectedEvent.decode());
    });

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });
});
