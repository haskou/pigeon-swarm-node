import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { PushSubscriptionEndpoint } from './value-objects/PushSubscriptionEndpoint';
import { PushSubscriptionKey } from './value-objects/PushSubscriptionKey';

export class PushSubscription {
  public static fromPrimitives(
    primitives: PrimitiveOf<PushSubscription>,
  ): PushSubscription {
    return new PushSubscription(
      new IdentityId(primitives.identityId),
      new PushSubscriptionEndpoint(primitives.endpoint),
      new PushSubscriptionKey(primitives.p256dh),
      new PushSubscriptionKey(primitives.auth),
      new Timestamp(primitives.createdAt),
      primitives.expirationTime
        ? new Timestamp(primitives.expirationTime)
        : undefined,
    );
  }

  public static register(
    identityId: IdentityId,
    endpoint: PushSubscriptionEndpoint,
    p256dh: PushSubscriptionKey,
    auth: PushSubscriptionKey,
    expirationTime?: Timestamp,
    createdAt: Timestamp = Timestamp.now(),
  ): PushSubscription {
    return new PushSubscription(
      identityId,
      endpoint,
      p256dh,
      auth,
      createdAt,
      expirationTime,
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private readonly endpoint: PushSubscriptionEndpoint,
    private readonly p256dh: PushSubscriptionKey,
    private readonly auth: PushSubscriptionKey,
    private readonly createdAt: Timestamp,
    private readonly expirationTime?: Timestamp,
  ) {}

  public getEndpoint(): PushSubscriptionEndpoint {
    return this.endpoint;
  }

  public belongsTo(identityId: IdentityId): boolean {
    return this.identityId.isEqual(identityId);
  }

  public toPrimitives() {
    return {
      auth: this.auth.valueOf(),
      createdAt: this.createdAt.valueOf(),
      endpoint: this.endpoint.valueOf(),
      ...(this.expirationTime
        ? { expirationTime: this.expirationTime.valueOf() }
        : {}),
      identityId: this.identityId.valueOf(),
      p256dh: this.p256dh.valueOf(),
    };
  }
}
