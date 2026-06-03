import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationScopeSettings } from '../NotificationScopeSettings';
import { NotificationSettingScope } from '../value-objects/NotificationSettingScope';

export interface NotificationScopeSettingsRepository {
  delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void>;
  findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]>;
  findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined>;
  save(settings: NotificationScopeSettings): Promise<void>;
}
