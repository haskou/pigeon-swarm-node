import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { PublisherHookPipeline } from '@haskou/ddd-kernel/adapters/pubsub';
import { PublisherHook } from '@haskou/ddd-kernel/contracts/pubsub';
import { Constructor } from '@haskou/ddd-kernel/domain';
import { DomainMessageBus } from '@haskou/ddd-kernel/domain';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import InvalidMessageBusAdapterError from '../errors/InvalidMessageBusAdapterError';
import { webSocketEventHub } from '../websocket/WebSocketEventHub';
import Libp2pGossipsubAdapter from './libp2p/Libp2pGossipsubMessageBusAdapter';
import MemoryMessageBusAdapter from './memory/MemoryMessageBusAdapter';
import { Message } from './Message';
import MessageBusAdapter from './MessageBusAdapter';

type LocalSubscriptionHandler = {
  DomainEventInstance: typeof DomainEvent;
  handler: (event: DomainEvent) => Promise<void>;
};

export default class MessageBus
  implements DomainMessageBus, DomainEventConsumer, DomainEventPublisher
{
  private static sourceEventContext = new Map<string, DomainEvent>();
  private static activeContextIds: string[] = [];
  private static replicatedEventPublisher?: DomainEventPublisher;
  private adapter: MessageBusAdapter;
  private readonly domainEventTypes = new Map<string, typeof DomainEvent>();
  private readonly publisherHooks = new PublisherHookPipeline();
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
    private readonly memoryAdapter: MemoryMessageBusAdapter,
    private readonly libp2pGossipsubAdapter: Libp2pGossipsubAdapter,
  ) {
    this.adapter = this.chooseAdapterFromDsn(pigeonEnvironment().TRANSPORT_DSN);
  }

  private chooseAdapterFromDsn(dsn: string): MessageBusAdapter {
    this.ensureDSNIsValid(dsn);

    if (dsn.startsWith('in-memory')) {
      return this.memoryAdapter;
    }

    if (dsn.startsWith('libp2p-gossipsub')) {
      return this.libp2pGossipsubAdapter;
    }

    throw new InvalidMessageBusAdapterError(dsn);
  }

  private ensureDSNIsValid(dsn: string): void {
    if (!dsn.startsWith('in-memory') && !dsn.startsWith('libp2p-gossipsub')) {
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

    this.registerEventType(bindingKey, DomainEventInstance);
    handlers.push({ DomainEventInstance, handler });
    this.localSubscriptionHandlers.set(bindingKey, handlers);
  }

  private async runPublisherHooks(domainEvents: DomainEvent[]): Promise<void> {
    for (const domainEvent of domainEvents) {
      await this.publisherHooks.run(
        {
          domainEvent,
          message: {
            name: domainEvent.eventName(),
            payload: JSON.parse(domainEvent.decode()) as Message,
          },
          metadata: {},
          topic: domainEvent.eventName(),
        },
        () => Promise.resolve(),
      );
    }
  }

  public registerEventType(
    bindingKey: string,
    DomainEventInstance: typeof DomainEvent,
  ): void {
    this.domainEventTypes.set(bindingKey, DomainEventInstance);
  }

  public registerPublisherHooks(...hooks: PublisherHook[]): void {
    this.publisherHooks.register(...hooks);
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const enrichedEvents = this.enrichEventsWithContext(domainEvents);
    await this.adapter.publish(enrichedEvents);
    await MessageBus.replicatedEventPublisher?.publish(enrichedEvents);
    webSocketEventHub.publish(enrichedEvents);
    await this.runPublisherHooks(enrichedEvents);
  }

  public async dispatchReplicated(message: Message): Promise<void> {
    const handlers = this.localSubscriptionHandlers.get(message.type) || [];
    const eventType = this.domainEventTypes.get(message.type);
    const events =
      handlers.length > 0
        ? handlers.map(({ DomainEventInstance }) =>
            this.instanceDomainEvent(DomainEventInstance, message),
          )
        : eventType
          ? [this.instanceDomainEvent(eventType, message)]
          : [];

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
