import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorizationTransitionReader } from '../../../domain/DeviceAuthorizationTransitionReader';
import { DeviceAuthorizationRevision } from '../../../domain/value-objects/DeviceAuthorizationRevision';

export class DeviceAuthorizationTransitionLogFindMessage {
  public constructor(
    public readonly identityId: IdentityId,
    public readonly reader: DeviceAuthorizationTransitionReader,
    public readonly after: DeviceAuthorizationRevision,
  ) {}
}
