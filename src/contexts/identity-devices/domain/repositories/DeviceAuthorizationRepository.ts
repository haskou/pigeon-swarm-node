import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';

export abstract class DeviceAuthorizationRepository {
  public abstract compareAndApply(
    transition: DeviceAuthorizationTransition,
  ): Promise<DeviceAuthorization>;

  public abstract find(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined>;

  public abstract provision(authorization: DeviceAuthorization): Promise<void>;
}
