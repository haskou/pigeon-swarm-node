import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { IdentityPresence } from '../IdentityPresence';

export default abstract class IdentityPresenceRepository {
  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence | undefined>;

  public abstract findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]>;

  public abstract findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]>;

  public abstract save(presence: IdentityPresence): Promise<void>;
}
