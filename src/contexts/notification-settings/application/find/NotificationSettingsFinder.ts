import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingsFindMessage } from './messages/NotificationSettingsFindMessage';

export default class NotificationSettingsFinder {
  constructor(
    private readonly repository: NotificationScopeSettingsRepository,
  ) {}

  public async find(
    message: NotificationSettingsFindMessage,
  ): Promise<NotificationScopeSettings[]> {
    return this.repository.findByIdentityId(message.getIdentityId());
  }
}
