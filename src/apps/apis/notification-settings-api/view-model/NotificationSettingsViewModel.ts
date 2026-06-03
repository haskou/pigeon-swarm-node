import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';

import { NotificationSettingsResource } from '../resources/NotificationSettingsResource';
import { NotificationScopeSettingsViewModel } from './NotificationScopeSettingsViewModel';

export class NotificationSettingsViewModel {
  constructor(private readonly settings: NotificationScopeSettings[]) {}

  public toResource(): NotificationSettingsResource {
    return {
      scopes: this.settings.map((setting) =>
        new NotificationScopeSettingsViewModel(setting).toResource(),
      ),
    };
  }
}
