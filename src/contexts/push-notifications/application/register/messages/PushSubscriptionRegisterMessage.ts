import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { PushSubscriptionEndpoint } from '../../../domain/value-objects/PushSubscriptionEndpoint';
import { PushSubscriptionKey } from '../../../domain/value-objects/PushSubscriptionKey';

export class PushSubscriptionRegisterMessage {
  public readonly identityId: IdentityId;
  public readonly endpoint: PushSubscriptionEndpoint;
  public readonly p256dh: PushSubscriptionKey;
  public readonly auth: PushSubscriptionKey;
  public readonly expirationTime?: Timestamp;

  constructor(
    identityId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    expirationTime?: number | null,
  ) {
    this.identityId = new IdentityId(identityId);
    this.endpoint = new PushSubscriptionEndpoint(endpoint);
    this.p256dh = new PushSubscriptionKey(p256dh);
    this.auth = new PushSubscriptionKey(auth);
    this.expirationTime = expirationTime
      ? new Timestamp(expirationTime)
      : undefined;
  }
}
