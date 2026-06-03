import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import { NotificationScopeSettingsRepository } from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationDeliveryShouldSendPushMessage } from './messages/NotificationDeliveryShouldSendPushMessage';

export class NotificationDeliveryPreferenceChecker {
  constructor(
    private readonly repository: NotificationScopeSettingsRepository,
  ) {}

  private async findMostSpecificSettings(
    message: NotificationDeliveryShouldSendPushMessage,
  ): Promise<NotificationScopeSettings | undefined> {
    const identityId = message.getIdentityId();
    const scope = message.getScope();
    const directSettings = await this.repository.findByScope(identityId, scope);

    if (directSettings) {
      return directSettings;
    }

    const parentScope = scope.getCommunityScope();

    if (!parentScope) {
      return undefined;
    }

    return this.repository.findByScope(identityId, parentScope);
  }

  public async shouldSendPush(
    message: NotificationDeliveryShouldSendPushMessage,
  ): Promise<boolean> {
    const settings = await this.findMostSpecificSettings(message);

    if (!settings) {
      return true;
    }

    return !settings.shouldSuppressPush(
      message.hasMentionedRecipient(),
      message.hasMentionedEveryoneOrHere(),
      message.hasMentionedRole(),
    );
  }
}
