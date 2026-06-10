import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '../../domain/value-objects/NotificationSettingScope';
import { OrbitDBNotificationScopeSettingsDocument } from './documents/OrbitDBNotificationScopeSettingsDocument';

// eslint-disable-next-line max-len
export default class OrbitDBNotificationScopeSettingsRepository extends NotificationScopeSettingsRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private documentId(identityId: IdentityId, scope: NotificationSettingScope) {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  private hasIdentityFields(document: Record<string, unknown>): boolean {
    return (
      document.removed !== true &&
      typeof document.id === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.scopeKey === 'string' &&
      typeof document.updatedAt === 'number'
    );
  }

  private hasPreferenceFields(document: Record<string, unknown>): boolean {
    return (
      typeof document.hideMutedChannels === 'boolean' &&
      typeof document.mobilePushEnabled === 'boolean' &&
      typeof document.notificationLevel === 'string' &&
      typeof document.suppressEveryoneAndHere === 'boolean' &&
      typeof document.suppressRoleMentions === 'boolean'
    );
  }

  private hasScopeField(document: Record<string, unknown>): boolean {
    return typeof document.scope === 'object' && document.scope !== null;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBNotificationScopeSettingsDocument {
    return (
      this.hasIdentityFields(document) &&
      this.hasPreferenceFields(document) &&
      this.hasScopeField(document)
    );
  }

  private toDocument(
    settings: NotificationScopeSettings,
  ): OrbitDBNotificationScopeSettingsDocument {
    const primitives = settings.toPrimitives();

    return {
      hideMutedChannels: primitives.hideMutedChannels,
      id: this.documentId(settings.getIdentityId(), settings.getScope()),
      identityId: primitives.identityId,
      mobilePushEnabled: primitives.mobilePushEnabled,
      mutedUntil: primitives.mutedUntil,
      notificationLevel: primitives.notificationLevel,
      scope: primitives.scope,
      scopeKey: primitives.scopeKey,
      suppressEveryoneAndHere: primitives.suppressEveryoneAndHere,
      suppressRoleMentions: primitives.suppressRoleMentions,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(
    document: OrbitDBNotificationScopeSettingsDocument,
  ): NotificationScopeSettings {
    return NotificationScopeSettings.fromPrimitives({
      hideMutedChannels: document.hideMutedChannels,
      identityId: document.identityId,
      mobilePushEnabled: document.mobilePushEnabled,
      mutedUntil: document.mutedUntil,
      notificationLevel: document.notificationLevel,
      scope: document.scope,
      scopeKey: document.scopeKey,
      suppressEveryoneAndHere: document.suppressEveryoneAndHere,
      suppressRoleMentions: document.suppressRoleMentions,
      updatedAt: document.updatedAt,
    });
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    await this.registry.putDocument('notificationSettings', {
      id: this.documentId(identityId, scope),
      identityId: identityId.valueOf(),
      removed: true,
      scope: scope.toPrimitives(),
      scopeKey: scope.key(),
      updatedAt: Date.now(),
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    const documents = await this.registry.queryDocuments(
      'notificationSettings',
      (document) => document.identityId === identityId.valueOf(),
    );

    return documents
      .filter(
        (document): document is OrbitDBNotificationScopeSettingsDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.toDomain(document));
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    const id = this.documentId(identityId, scope);
    const [document] = await this.registry.queryDocuments(
      'notificationSettings',
      (candidate) => candidate.id === id,
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    await this.registry.putDocument(
      'notificationSettings',
      this.toDocument(settings),
    );
  }
}
