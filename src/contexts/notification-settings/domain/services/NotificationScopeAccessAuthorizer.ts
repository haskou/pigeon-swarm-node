import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationSettingScope } from '../value-objects/NotificationSettingScope';

export default abstract class NotificationScopeAccessAuthorizer {
  public abstract authorize(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void>;
}
