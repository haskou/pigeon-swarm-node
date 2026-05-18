import { PushSubscription } from '../../domain/PushSubscription';
import { PushSubscriptionRepository } from '../../domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionRegisterMessage } from './messages/PushSubscriptionRegisterMessage';

export class PushSubscriptionRegistrar {
  constructor(private readonly repository: PushSubscriptionRepository) {}

  public async register(
    message: PushSubscriptionRegisterMessage,
  ): Promise<PushSubscription> {
    const subscription = PushSubscription.register(
      message.identityId,
      message.endpoint,
      message.p256dh,
      message.auth,
      message.expirationTime,
    );

    await this.repository.save(subscription);

    return subscription;
  }
}
