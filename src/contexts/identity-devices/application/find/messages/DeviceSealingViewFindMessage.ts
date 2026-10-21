import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class DeviceSealingViewFindMessage {
  public constructor(public readonly identityId: IdentityId) {}
}
