import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushSubscriptionEndpoint } from '../../../domain/value-objects/PushSubscriptionEndpoint';

export class PushNotificationTestMessage {
  public readonly endpoint?: PushSubscriptionEndpoint;
  public readonly identityId: IdentityId;

  constructor(identityId: string, endpoint?: string) {
    this.identityId = new IdentityId(identityId);
    this.endpoint = endpoint
      ? new PushSubscriptionEndpoint(endpoint)
      : undefined;
  }
}
