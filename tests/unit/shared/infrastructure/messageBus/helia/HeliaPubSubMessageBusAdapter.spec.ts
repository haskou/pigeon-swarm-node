import DomainEvent from '@app/shared/domain/events/DomainEvent';
import HeliaPubSubMessageBusAdapter from '@app/shared/infrastructure/messageBus/helia/HeliaPubSubMessageBusAdapter';
import { PubSubTransport } from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { mock, MockProxy } from 'jest-mock-extended';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

describe('HeliaPubSubMessageBusAdapter', () => {
  let transport: MockProxy<PubSubTransport>;
  let adapter: HeliaPubSubMessageBusAdapter;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'test-service';
    transport = mock<PubSubTransport>();
    adapter = new HeliaPubSubMessageBusAdapter(transport);
  });

  it('should publish domain events to pubsub topics', async () => {
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    await adapter.publish([event]);

    expect(transport.publish).toHaveBeenCalledWith(
      'test-service.test.event',
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
      'test-service.test.event',
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(handler.mock.calls[0][0].toPrimitives).toBeUndefined();
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });
});
