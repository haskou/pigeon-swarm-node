import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceSealedSecretBundle } from '../DeviceSealedSecretBundle';

export abstract class DeviceSealedSecretRepository {
  public abstract has(identityId: IdentityId): Promise<boolean>;

  /** Stores the bundle only when its generation is newer than the stored one. */
  public abstract replaceIfNewer(
    bundle: DeviceSealedSecretBundle,
  ): Promise<void>;

  /** Rejects with DeviceSealedSecretNotFoundError when no bundle is stored. */
  public abstract require(
    identityId: IdentityId,
  ): Promise<DeviceSealedSecretBundle>;
}
