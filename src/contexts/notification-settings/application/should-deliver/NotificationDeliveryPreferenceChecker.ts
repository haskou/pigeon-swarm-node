import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationDeliveryShouldSendPushMessage } from './messages/NotificationDeliveryShouldSendPushMessage';

export default class NotificationDeliveryPreferenceChecker {
  constructor(
    private readonly repository: NotificationScopeSettingsRepository,
  ) {}

  private async findMostSpecificSettings(
    message: NotificationDeliveryShouldSendPushMessage,
  ): Promise<NotificationScopeSettings | undefined> {
    const identityId = message.getIdentityId();
    const scope = message.getScope();

    if (await this.repository.hasByScope(identityId, scope)) {
      return this.repository.requireByScope(identityId, scope);
    }

    const parentScope = scope.getCommunityScope();

    if (!parentScope) {
      return undefined;
    }

    if (!(await this.repository.hasByScope(identityId, parentScope))) {
      return undefined;
    }

    return this.repository.requireByScope(identityId, parentScope);
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
