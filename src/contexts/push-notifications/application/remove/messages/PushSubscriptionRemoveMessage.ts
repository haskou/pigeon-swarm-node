import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushSubscriptionEndpoint } from '../../../domain/value-objects/PushSubscriptionEndpoint';

export class PushSubscriptionRemoveMessage {
  public readonly identityId: IdentityId;
  public readonly endpoint: PushSubscriptionEndpoint;

  constructor(identityId: string, endpoint: string) {
    this.identityId = new IdentityId(identityId);
    this.endpoint = new PushSubscriptionEndpoint(endpoint);
  }
}
