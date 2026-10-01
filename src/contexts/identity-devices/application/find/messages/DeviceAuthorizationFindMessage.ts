import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class DeviceAuthorizationFindMessage {
  public constructor(public readonly identityId: IdentityId) {}
}
