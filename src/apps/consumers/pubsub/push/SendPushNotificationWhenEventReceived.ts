import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

// eslint-disable-next-line max-len
export default abstract class SendPushNotificationWhenEventReceived extends Consumer {
  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly dispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer);
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.dispatcher.dispatch(event);
  }
}
