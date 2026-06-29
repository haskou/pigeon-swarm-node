import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationScopeSettingsResetMessage } from './messages/NotificationScopeSettingsResetMessage';

export default class NotificationScopeSettingsResetter {
  constructor(
    private readonly repository: NotificationScopeSettingsRepository,
    private readonly messageBus: DomainEventPublisher,
  ) {}

  public async reset(
    message: NotificationScopeSettingsResetMessage,
  ): Promise<void> {
    const identityId = message.getIdentityId();
    const scope = message.getScope();
    const settings = NotificationScopeSettings.defaultForScope(
      identityId,
      scope,
    );

    settings.recordReset();
    await this.repository.delete(identityId, scope);
    await this.messageBus.publish(settings.pullDomainEvents());
  }
}
