import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import InvalidMessageBusAdapterError from '../errors/InvalidMessageBusAdapterError';
import AmqpMessageBusAdapter from './amqp/AmqpMessageBusAdapter';
import HeliaPubSubMessageBusAdapter from './helia/HeliaPubSubMessageBusAdapter';
import MemoryMessageBusAdapter from './memory/MemoryMessageBusAdapter';
import MessageBusAdapter from './MessageBusAdapter';

export default class MessageBus
  implements DomainEventConsumer, DomainEventPublisher
{
  private static sourceEventContext = new Map<string, DomainEvent>();
  private static activeContextIds: string[] = [];
  private adapter: MessageBusAdapter;

  private static setSourceEvent(event: DomainEvent): void {
    if (!event.eventId) {
      return;
    }

    MessageBus.sourceEventContext.set(event.eventId, event);
    MessageBus.activeContextIds.push(event.eventId);
  }

  private static clearSourceEvent(): void {
    const eventId = MessageBus.activeContextIds.pop();

    if (eventId) {
      MessageBus.sourceEventContext.delete(eventId);
    }
  }

  private static getCurrentSourceEvent(): DomainEvent | undefined {
    const currentEventId =
      MessageBus.activeContextIds[MessageBus.activeContextIds.length - 1];

    if (!currentEventId) {
      return undefined;
    }

    return MessageBus.sourceEventContext.get(currentEventId);
  }

  constructor(
    private readonly amqpAdapter: AmqpMessageBusAdapter,
    private readonly memoryAdapter: MemoryMessageBusAdapter,
    private readonly heliaPubSubAdapter: HeliaPubSubMessageBusAdapter,
  ) {
    this.adapter = this.chooseAdapterFromDsn(process.env.TRANSPORT_DSN || '');
  }

  private chooseAdapterFromDsn(dsn: string): MessageBusAdapter {
    this.ensureDSNIsValid(process.env.TRANSPORT_DSN || '');

    if (dsn.startsWith('amqp')) {
      return this.amqpAdapter;
    }

    if (dsn.startsWith('in-memory')) {
      return this.memoryAdapter;
    }

    if (dsn.startsWith('helia-pubsub')) {
      return this.heliaPubSubAdapter;
    }

    throw new InvalidMessageBusAdapterError(dsn);
  }

  private ensureDSNIsValid(dsn: string): void {
    if (
      !dsn.startsWith('amqp') &&
      !dsn.startsWith('in-memory') &&
      !dsn.startsWith('helia-pubsub')
    ) {
      throw new InvalidMessageBusAdapterError(dsn);
    }
  }

  private getCorrelationId(event: DomainEvent): string | undefined {
    return 'correlationId' in event ? event.getCorrelationId() : undefined;
  }

  private getCausationId(event: DomainEvent): string | undefined {
    return 'eventId' in event ? event.eventId : undefined;
  }

  private enrichEventsWithContext(events: DomainEvent[]): DomainEvent[] {
    const sourceEvent = MessageBus.getCurrentSourceEvent();

    if (!sourceEvent) {
      return events;
    }

    const correlationId =
      this.getCorrelationId(sourceEvent) || this.getCausationId(sourceEvent);
    const causationId = this.getCausationId(sourceEvent);

    return events.map((event) => {
      if (correlationId && typeof event.withCorrelationId === 'function') {
        event.withCorrelationId(correlationId);
      }

      if (causationId && typeof event.withCausationId === 'function') {
        event.withCausationId(causationId);
      }

      return event;
    });
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const enrichedEvents = this.enrichEventsWithContext(domainEvents);
    await this.adapter.publish(enrichedEvents);
  }

  public async consume(
    queueName: string,
    bindingKey: string,
    domainEvent: typeof DomainEvent,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const wrappedHandler = async (event: DomainEvent): Promise<void> => {
      try {
        MessageBus.setSourceEvent(event);
        await handler(event);
      } finally {
        MessageBus.clearSourceEvent();
      }
    };

    await this.adapter.consume(
      queueName,
      bindingKey,
      domainEvent,
      exchange,
      wrappedHandler,
    );
  }
}
