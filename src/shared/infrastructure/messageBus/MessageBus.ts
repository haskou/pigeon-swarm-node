import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import InvalidMessageBusAdapterError from '../errors/InvalidMessageBusAdapterError';
import { webSocketEventHub } from '../websocket/WebSocketEventHub';
import AmqpMessageBusAdapter from './amqp/AmqpMessageBusAdapter';
import Libp2pGossipsubAdapter from './libp2p/Libp2pGossipsubMessageBusAdapter';
import MemoryMessageBusAdapter from './memory/MemoryMessageBusAdapter';
import { Message } from './Message';
import MessageBusAdapter from './MessageBusAdapter';

type LocalSubscriptionHandler = {
  DomainEventInstance: typeof DomainEvent;
  handler: (event: DomainEvent) => Promise<void>;
};

export default class MessageBus
  implements DomainEventConsumer, DomainEventPublisher
{
  private static sourceEventContext = new Map<string, DomainEvent>();
  private static activeContextIds: string[] = [];
  private static replicatedEventPublisher?: DomainEventPublisher;
  private adapter: MessageBusAdapter;
  private readonly localSubscriptionHandlers = new Map<
    string,
    LocalSubscriptionHandler[]
  >();

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

  public static setReplicatedEventPublisher(
    publisher: DomainEventPublisher,
  ): void {
    MessageBus.replicatedEventPublisher = publisher;
  }

  public static clearReplicatedEventPublisher(): void {
    MessageBus.replicatedEventPublisher = undefined;
  }

  constructor(
    private readonly amqpAdapter: AmqpMessageBusAdapter,
    private readonly memoryAdapter: MemoryMessageBusAdapter,
    private readonly libp2pGossipsubAdapter: Libp2pGossipsubAdapter,
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

    if (dsn.startsWith('libp2p-gossipsub')) {
      return this.libp2pGossipsubAdapter;
    }

    throw new InvalidMessageBusAdapterError(dsn);
  }

  private ensureDSNIsValid(dsn: string): void {
    if (
      !dsn.startsWith('amqp') &&
      !dsn.startsWith('in-memory') &&
      !dsn.startsWith('libp2p-gossipsub')
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

  private instanceDomainEvent(
    DomainEventInstance: typeof DomainEvent,
    message: Message,
  ): DomainEvent {
    const EventConstructor = DomainEventInstance as Constructor<DomainEvent>;

    return new EventConstructor(
      message.aggregate_id,
      message.attributes,
      message.event_id,
      new Date(message.occurred_on),
      message.user_id,
    );
  }

  private registerLocalHandler(
    bindingKey: string,
    DomainEventInstance: typeof DomainEvent,
    handler: (event: DomainEvent) => Promise<void>,
  ): void {
    const handlers = this.localSubscriptionHandlers.get(bindingKey) || [];

    handlers.push({ DomainEventInstance, handler });
    this.localSubscriptionHandlers.set(bindingKey, handlers);
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const enrichedEvents = this.enrichEventsWithContext(domainEvents);
    await this.adapter.publish(enrichedEvents);
    await MessageBus.replicatedEventPublisher?.publish(enrichedEvents);
    webSocketEventHub.publish(enrichedEvents);
  }

  public async dispatchReplicated(message: Message): Promise<void> {
    const handlers = this.localSubscriptionHandlers.get(message.type) || [];
    const events = handlers.map(({ DomainEventInstance }) =>
      this.instanceDomainEvent(DomainEventInstance, message),
    );

    await Promise.all(
      handlers.map(async ({ DomainEventInstance, handler }) => {
        const event = this.instanceDomainEvent(DomainEventInstance, message);

        try {
          MessageBus.setSourceEvent(event);
          await handler(event);
        } finally {
          MessageBus.clearSourceEvent();
        }
      }),
    );

    webSocketEventHub.publish(events);
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

    this.registerLocalHandler(bindingKey, domainEvent, wrappedHandler);

    await this.adapter.consume(
      queueName,
      bindingKey,
      domainEvent,
      exchange,
      wrappedHandler,
    );
  }
}
