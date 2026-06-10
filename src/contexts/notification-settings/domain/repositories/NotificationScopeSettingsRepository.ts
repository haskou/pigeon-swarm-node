import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationScopeSettings } from '../NotificationScopeSettings';
import { NotificationSettingScope } from '../value-objects/NotificationSettingScope';

export default abstract class NotificationScopeSettingsRepository {
  public abstract delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void>;

  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]>;

  public abstract findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined>;

  public abstract save(settings: NotificationScopeSettings): Promise<void>;
}
