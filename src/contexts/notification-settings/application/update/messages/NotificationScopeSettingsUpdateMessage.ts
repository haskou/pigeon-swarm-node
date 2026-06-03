import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { NotificationScopeSettingsPreferences as Preferences } from '../../../domain/NotificationScopeSettingsPreferences';
import { NotificationSettingScope } from '../../../domain/value-objects/NotificationSettingScope';
import { NotificationSettingScopeType } from '../../../domain/value-objects/NotificationSettingScopeType';

export class NotificationScopeSettingsUpdateMessage {
  constructor(
    private readonly identityId: string,
    private readonly scope: PrimitiveOf<NotificationSettingScope>,
    private readonly preferences: PrimitiveOf<Preferences>,
  ) {}

  private scopeType(): NotificationSettingScopeType {
    return new NotificationSettingScopeType(this.scope.type);
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getPreferences(): Preferences {
    return Preferences.fromPrimitives({
      hideMutedChannels: this.preferences.hideMutedChannels ?? false,
      mobilePushEnabled: this.preferences.mobilePushEnabled ?? true,
      mutedUntil: this.preferences.mutedUntil,
      notificationLevel: this.preferences.notificationLevel,
      suppressEveryoneAndHere:
        this.preferences.suppressEveryoneAndHere ?? false,
      suppressRoleMentions: this.preferences.suppressRoleMentions ?? false,
    });
  }

  public getScope(): NotificationSettingScope {
    const type = this.scopeType();

    if (type.isConversation()) {
      return NotificationSettingScope.conversation(
        new ConversationId(this.scope.conversationId || ''),
      );
    }

    if (type.isCommunityChannel()) {
      return NotificationSettingScope.communityChannel(
        new CommunityId(this.scope.communityId || ''),
        new CommunityChannelId(this.scope.channelId || ''),
      );
    }

    return NotificationSettingScope.community(
      new CommunityId(this.scope.communityId || ''),
    );
  }
}
