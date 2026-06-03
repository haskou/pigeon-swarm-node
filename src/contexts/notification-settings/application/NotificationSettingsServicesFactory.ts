import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoNotificationScopeSettingsRepository } from '../infrastructure/mongo/MongoNotificationScopeSettingsRepository';
import { NotificationSettingsFinder } from './find/NotificationSettingsFinder';
import { NotificationScopeSettingsResetter } from './reset/NotificationScopeSettingsResetter';
import { NotificationScopeSettingsUpdater } from './update/NotificationScopeSettingsUpdater';

export class NotificationSettingsServicesFactory {
  private readonly repository = new MongoNotificationScopeSettingsRepository(
    this.mongo,
  );

  constructor(
    private readonly mongo: MongoDB,
    private readonly messageBus: MessageBus,
  ) {}

  public finder(): NotificationSettingsFinder {
    return new NotificationSettingsFinder(this.repository);
  }

  public resetter(): NotificationScopeSettingsResetter {
    return new NotificationScopeSettingsResetter(
      this.repository,
      this.messageBus,
    );
  }

  public updater(): NotificationScopeSettingsUpdater {
    return new NotificationScopeSettingsUpdater(
      this.repository,
      this.messageBus,
    );
  }
}
