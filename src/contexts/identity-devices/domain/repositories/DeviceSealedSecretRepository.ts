import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceSealedSecretBundle } from '../DeviceSealedSecretBundle';

export abstract class DeviceSealedSecretRepository {
  public abstract find(
    identityId: IdentityId,
  ): Promise<DeviceSealedSecretBundle | undefined>;

  /** Stores the bundle only when its generation is newer than the stored one. */
  public abstract replaceIfNewer(
    bundle: DeviceSealedSecretBundle,
  ): Promise<void>;
}
