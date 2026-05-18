import { PushSubscription } from '@app/contexts/push-notifications/domain/PushSubscription';

export class PushSubscriptionViewModel {
  constructor(private readonly subscription: PushSubscription) {}

  public toResource(): {
    endpoint: string;
    expirationTime: number | null;
    identityId: string;
  } {
    const primitives = this.subscription.toPrimitives();

    return {
      endpoint: primitives.endpoint,
      expirationTime: primitives.expirationTime ?? null,
      identityId: primitives.identityId,
    };
  }
}
