import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '../../domain/value-objects/NotificationSettingScope';
import { OrbitDBNotificationScopeSettingsDocument } from './documents/OrbitDBNotificationScopeSettingsDocument';

export default class OrbitDBNotificationScopeSettingsRepository extends NotificationScopeSettingsRepository {
  private readonly settingsIndex: OrbitDBHeadIndex<OrbitDBNotificationScopeSettingsDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.settingsIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'notificationSettings',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private documentId(identityId: IdentityId, scope: NotificationSettingScope) {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  private identityIndexHeadKey(identityId: IdentityId) {
    return `notification-settings-identity-index:${identityId.valueOf()}`;
  }

  private hasIdentityFields(document: Record<string, unknown>): boolean {
    return (
      document.removed !== true &&
      document.scopeType === 'notification_settings' &&
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
    const hasRequiredFields =
      this.hasIdentityFields(document) &&
      this.hasPreferenceFields(document) &&
      this.hasScopeField(document);

    if (!hasRequiredFields) return false;
    const candidate = document as OrbitDBNotificationScopeSettingsDocument;

    try {
      const settings = this.toDomain(candidate);

      return (
        candidate.identityId === settings.getIdentityId().valueOf() &&
        candidate.scopeKey === settings.getScope().key() &&
        candidate.id ===
          this.documentId(settings.getIdentityId(), settings.getScope())
      );
    } catch {
      return false;
    }
  }

  private toDocument(
    settings: NotificationScopeSettings,
  ): Record<string, unknown> {
    return {
      ...settings.toPrimitives(),
      id: this.documentId(settings.getIdentityId(), settings.getScope()),
      scopeType: 'notification_settings',
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

  private async write(
    identityId: IdentityId,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);
    const key = this.identityIndexHeadKey(identityId);

    PublicMutationRecord.assertNotStale(
      (await this.settingsIndex.findRecords(key)).filter(
        (stored) => stored.id === payload.id,
      ),
      document,
    );
    await this.registry.putDocument('notificationSettings', document);
    await this.settingsIndex.putRecord(
      key,
      { id: key, identityId: identityId.valueOf() },
      document,
    );
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        id: this.documentId(identityId, scope),
        identityId: identityId.valueOf(),
        removed: true,
        scopeKey: scope.key(),
        scopeType: 'notification_settings',
      },
      proof,
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    const documents =
      (await this.settingsIndex.find(this.identityIndexHeadKey(identityId))) ??
      [];

    return documents
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.toDomain(document));
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    const id = this.documentId(identityId, scope);
    const document = (
      (await this.settingsIndex.find(this.identityIndexHeadKey(identityId))) ??
      []
    ).find((candidate) => candidate.id === id);

    return document ? this.toDomain(document) : undefined;
  }

  public isPrivateScope(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public async save(
    settings: NotificationScopeSettings,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      settings.getIdentityId(),
      this.toDocument(settings),
      proof,
    );
  }
}
