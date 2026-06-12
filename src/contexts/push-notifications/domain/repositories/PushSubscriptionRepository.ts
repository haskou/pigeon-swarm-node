import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushSubscription } from '../PushSubscription';
import { PushSubscriptionEndpoint } from '../value-objects/PushSubscriptionEndpoint';

export default abstract class PushSubscriptionRepository {
  public abstract delete(
    identityId: IdentityId,
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void>;

  public abstract deleteByEndpoint(
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void>;

  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<PushSubscription[]>;

  public abstract save(subscription: PushSubscription): Promise<void>;
}
