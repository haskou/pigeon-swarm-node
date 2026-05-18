import { PushNotificationDispatcher } from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class SendPushNotificationWhenEventReceived extends Consumer {
  constructor(
    consumer: DomainEventConsumer,
    private readonly eventClass: typeof DomainEvent,
    private readonly eventNameValue: string,
    private readonly queueNameValue: string,
    private readonly dispatcher: PushNotificationDispatcher,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return this.queueNameValue;
  }

  public get eventName(): string {
    return this.eventNameValue;
  }

  public get domainEvent(): typeof DomainEvent {
    return this.eventClass;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.dispatcher.dispatch(event);
  }
}
