import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

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
