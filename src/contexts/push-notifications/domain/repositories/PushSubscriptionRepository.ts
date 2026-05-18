import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushSubscription } from '../PushSubscription';
import { PushSubscriptionEndpoint } from '../value-objects/PushSubscriptionEndpoint';

export interface PushSubscriptionRepository {
  delete(
    identityId: IdentityId,
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void>;
  deleteByEndpoint(endpoint: PushSubscriptionEndpoint): Promise<void>;
  findByIdentityId(identityId: IdentityId): Promise<PushSubscription[]>;
  save(subscription: PushSubscription): Promise<void>;
}
