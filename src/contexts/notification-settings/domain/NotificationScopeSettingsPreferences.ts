import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { NotificationLevel } from './value-objects/NotificationLevel';
import { NotificationMuteUntil } from './value-objects/NotificationMuteUntil';

export class NotificationScopeSettingsPreferences {
  public static defaults(): NotificationScopeSettingsPreferences {
    return new NotificationScopeSettingsPreferences(
      new NotificationLevel(NotificationLevel.ALL),
      undefined,
      false,
      false,
      true,
      false,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<NotificationScopeSettingsPreferences>,
  ): NotificationScopeSettingsPreferences {
    return new NotificationScopeSettingsPreferences(
      new NotificationLevel(primitives.notificationLevel),
      primitives.mutedUntil === undefined
        ? undefined
        : primitives.mutedUntil === null
          ? NotificationMuteUntil.forever()
          : NotificationMuteUntil.fromTimestamp(
              new Timestamp(primitives.mutedUntil),
            ),
      primitives.suppressEveryoneAndHere,
      primitives.suppressRoleMentions,
      primitives.mobilePushEnabled,
      primitives.hideMutedChannels,
    );
  }

  constructor(
    private readonly notificationLevel: NotificationLevel,
    private readonly mutedUntil: NotificationMuteUntil | undefined,
    private readonly suppressEveryoneAndHere: boolean,
    private readonly suppressRoleMentions: boolean,
    private readonly mobilePushEnabled: boolean,
    private readonly hideMutedChannels: boolean,
  ) {}

  private blocksAllNotifications(): boolean {
    return this.notificationLevel.blocksAll();
  }

  private blocksNonMention(
    mentionsRecipient: boolean,
    mentionsEveryoneOrHere: boolean,
    mentionsRole: boolean,
  ): boolean {
    return (
      this.notificationLevel.allowsMentionsOnly() &&
      !mentionsRecipient &&
      !mentionsEveryoneOrHere &&
      !mentionsRole
    );
  }

  private blocksNonMentionedPush(
    mentionsRecipient: boolean,
    mentionsEveryoneOrHere: boolean,
    mentionsRole: boolean,
  ): boolean {
    return this.blocksNonMention(
      mentionsRecipient,
      mentionsEveryoneOrHere,
      mentionsRole,
    );
  }

  private disablesMobilePush(): boolean {
    return !this.mobilePushEnabled;
  }

  private isMuted(now: Timestamp): boolean {
    return this.mutedUntil?.isActive(now) || false;
  }

  private suppressesEveryoneOrHere(mentionsEveryoneOrHere: boolean): boolean {
    return this.suppressEveryoneAndHere && mentionsEveryoneOrHere;
  }

  private suppressesRoleMention(mentionsRole: boolean): boolean {
    return this.suppressRoleMentions && mentionsRole;
  }

  public shouldSuppressPush(
    mentionsRecipient: boolean,
    mentionsEveryoneOrHere: boolean,
    mentionsRole: boolean,
    now: Timestamp = Timestamp.now(),
  ): boolean {
    return (
      this.disablesMobilePush() ||
      this.isMuted(now) ||
      this.blocksAllNotifications() ||
      this.suppressesEveryoneOrHere(mentionsEveryoneOrHere) ||
      this.suppressesRoleMention(mentionsRole) ||
      this.blocksNonMentionedPush(
        mentionsRecipient,
        mentionsEveryoneOrHere,
        mentionsRole,
      )
    );
  }

  public toPrimitives() {
    return {
      hideMutedChannels: this.hideMutedChannels,
      mobilePushEnabled: this.mobilePushEnabled,
      ...(this.mutedUntil === undefined
        ? {}
        : { mutedUntil: this.mutedUntil.toPrimitives() }),
      notificationLevel: this.notificationLevel.valueOf(),
      suppressEveryoneAndHere: this.suppressEveryoneAndHere,
      suppressRoleMentions: this.suppressRoleMentions,
    };
  }
}
