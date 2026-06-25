import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '../../domain/value-objects/NotificationSettingScope';
import { OrbitDBNotificationScopeSettingsDocument } from './documents/OrbitDBNotificationScopeSettingsDocument';

export default class OrbitDBNotificationScopeSettingsRepository extends NotificationScopeSettingsRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private documentId(identityId: IdentityId, scope: NotificationSettingScope) {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  private headKey(identityId: IdentityId, scope: NotificationSettingScope) {
    return `notification-settings:${this.documentId(identityId, scope)}`;
  }

  private identityIndexHeadKey(identityId: IdentityId) {
    return `notification-settings-identity-index:${identityId.valueOf()}`;
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

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBNotificationScopeSettingsDocument[] {
    const settings = record?.settings;

    if (!Array.isArray(settings)) {
      return [];
    }

    return settings.filter(
      (document): document is OrbitDBNotificationScopeSettingsDocument =>
        typeof document === 'object' &&
        document !== null &&
        !Array.isArray(document) &&
        this.isDocument(document as Record<string, unknown>),
    );
  }

  private deduplicateDocuments(
    documents: OrbitDBNotificationScopeSettingsDocument[],
  ): OrbitDBNotificationScopeSettingsDocument[] {
    const deduplicated = new Map<
      string,
      OrbitDBNotificationScopeSettingsDocument
    >();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || current.updatedAt <= document.updatedAt) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
  }

  private async putHeads(
    document: OrbitDBNotificationScopeSettingsDocument,
  ): Promise<void> {
    await this.registry.putHead(`notification-settings:${document.id}`, {
      ...document,
    });

    const key = `notification-settings-identity-index:${document.identityId}`;
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const settings = this.deduplicateDocuments([...indexedDocuments, document]);

    await this.registry.putHead(key, {
      id: key,
      identityId: document.identityId,
      settings: settings.map((setting) => ({ ...setting })),
      updatedAt: Date.now(),
    });
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    const document = {
      id: this.documentId(identityId, scope),
      identityId: identityId.valueOf(),
      removed: true,
      scope: scope.toPrimitives(),
      scopeKey: scope.key(),
      updatedAt: Date.now(),
    };

    await this.registry.putDocument('notificationSettings', document);
    await this.registry.putHead(this.headKey(identityId, scope), document);

    const key = this.identityIndexHeadKey(identityId);
    const settings = this.documentsFromIndex(
      await this.registry.findHead(key),
    ).filter((setting) => setting.id !== document.id);

    await this.registry.putHead(key, {
      id: key,
      identityId: identityId.valueOf(),
      settings: settings.map((setting) => ({ ...setting })),
      updatedAt: Date.now(),
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    return this.documentsFromIndex(
      await this.registry.findHead(this.identityIndexHeadKey(identityId)),
    ).map((document) => this.toDomain(document));
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    const document = await this.registry.findHead(
      this.headKey(identityId, scope),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    const document = this.toDocument(settings);

    await this.registry.putDocument('notificationSettings', document);
    await this.putHeads(document);
  }
}
