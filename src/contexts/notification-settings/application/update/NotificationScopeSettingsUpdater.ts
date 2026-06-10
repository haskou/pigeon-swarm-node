import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationScopeSettingsUpdateMessage } from './messages/NotificationScopeSettingsUpdateMessage';

export class NotificationScopeSettingsUpdater {
  constructor(
    private readonly repository: NotificationScopeSettingsRepository,
    private readonly messageBus: MessageBus,
  ) {}

  public async update(
    message: NotificationScopeSettingsUpdateMessage,
  ): Promise<NotificationScopeSettings> {
    const identityId = message.getIdentityId();
    const scope = message.getScope();
    const settings =
      (await this.repository.findByScope(identityId, scope)) ??
      NotificationScopeSettings.defaultForScope(identityId, scope);

    settings.update(message.getPreferences());

    await this.repository.save(settings);
    await this.messageBus.publish(settings.pullDomainEvents());

    return settings;
  }
}
