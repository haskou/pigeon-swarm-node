import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { NotificationSettingsWereResetEvent } from './events/NotificationSettingsWereResetEvent';
import { NotificationSettingsWereUpdatedEvent } from './events/NotificationSettingsWereUpdatedEvent';
import { NotificationScopeSettingsPreferences } from './NotificationScopeSettingsPreferences';
import { NotificationSettingScope } from './value-objects/NotificationSettingScope';

export class NotificationScopeSettings extends AggregateRoot {
  public static create(
    identityId: IdentityId,
    scope: NotificationSettingScope,
    preferences: NotificationScopeSettingsPreferences,
    updatedAt: Timestamp = Timestamp.now(),
  ): NotificationScopeSettings {
    const settings = new NotificationScopeSettings(
      identityId,
      scope,
      preferences,
      updatedAt,
    );

    settings.recordUpdated();

    return settings;
  }

  public static defaultForScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): NotificationScopeSettings {
    return new NotificationScopeSettings(
      identityId,
      scope,
      NotificationScopeSettingsPreferences.defaults(),
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<NotificationScopeSettings>,
  ): NotificationScopeSettings {
    return new NotificationScopeSettings(
      new IdentityId(primitives.identityId),
      NotificationSettingScope.fromPrimitives(primitives.scope),
      NotificationScopeSettingsPreferences.fromPrimitives({
        hideMutedChannels: primitives.hideMutedChannels,
        mobilePushEnabled: primitives.mobilePushEnabled,
        mutedUntil: primitives.mutedUntil,
        notificationLevel: primitives.notificationLevel,
        suppressEveryoneAndHere: primitives.suppressEveryoneAndHere,
        suppressRoleMentions: primitives.suppressRoleMentions,
      }),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private readonly scope: NotificationSettingScope,
    private preferences: NotificationScopeSettingsPreferences,
    private updatedAt: Timestamp,
  ) {
    super();
  }

  private recordUpdated(): void {
    const primitives = this.toPrimitives();

    this.record(
      new NotificationSettingsWereUpdatedEvent(
        `${primitives.identityId}:${primitives.scopeKey}`,
        primitives,
      ),
    );
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getScope(): NotificationSettingScope {
    return this.scope;
  }

  public recordReset(): void {
    const primitives = this.toPrimitives();

    this.record(
      new NotificationSettingsWereResetEvent(
        `${primitives.identityId}:${primitives.scopeKey}`,
        {
          identityId: primitives.identityId,
          scope: primitives.scope,
          scopeKey: primitives.scopeKey,
        },
      ),
    );
  }

  public shouldSuppressPush(
    mentionsRecipient: boolean,
    mentionsEveryoneOrHere: boolean,
    mentionsRole: boolean,
    now: Timestamp = Timestamp.now(),
  ): boolean {
    return this.preferences.shouldSuppressPush(
      mentionsRecipient,
      mentionsEveryoneOrHere,
      mentionsRole,
      now,
    );
  }

  public update(
    preferences: NotificationScopeSettingsPreferences,
    updatedAt: Timestamp = Timestamp.now(),
  ): void {
    this.preferences = preferences;
    this.updatedAt = updatedAt;
    this.recordUpdated();
  }

  public toPrimitives() {
    const preferences = this.preferences.toPrimitives();

    return {
      hideMutedChannels: preferences.hideMutedChannels,
      identityId: this.identityId.valueOf(),
      mobilePushEnabled: preferences.mobilePushEnabled,
      ...(preferences.mutedUntil === undefined
        ? {}
        : { mutedUntil: preferences.mutedUntil }),
      notificationLevel: preferences.notificationLevel,
      scope: this.scope.toPrimitives(),
      scopeKey: this.scope.key(),
      suppressEveryoneAndHere: preferences.suppressEveryoneAndHere,
      suppressRoleMentions: preferences.suppressRoleMentions,
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
