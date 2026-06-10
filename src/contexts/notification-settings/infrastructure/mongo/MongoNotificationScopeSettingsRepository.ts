import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { NotificationScopeSettings } from '../../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '../../domain/value-objects/NotificationSettingScope';
import { MongoNotificationScopeSettingsDocument } from './documents/MongoNotificationScopeSettingsDocument';

// eslint-disable-next-line max-len
export default class MongoNotificationScopeSettingsRepository extends NotificationScopeSettingsRepository {
  private static readonly COLLECTION = 'notification_scope_settings';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private documentId(identityId: IdentityId, scope: NotificationSettingScope) {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  private async collection() {
    return this.mongo.getCollection<MongoNotificationScopeSettingsDocument>(
      MongoNotificationScopeSettingsRepository.COLLECTION,
    );
  }

  private toDocument(
    settings: NotificationScopeSettings,
  ): MongoNotificationScopeSettingsDocument {
    const primitives = settings.toPrimitives();

    return {
      _id: this.documentId(settings.getIdentityId(), settings.getScope()),
      hideMutedChannels: primitives.hideMutedChannels,
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
    document: MongoNotificationScopeSettingsDocument,
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
    const collection = await this.collection();

    await collection.deleteOne({
      _id: this.documentId(identityId, scope),
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    const collection = await this.collection();
    const documents = await collection
      .find({ identityId: identityId.valueOf() })
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    const collection = await this.collection();
    const document = await collection.findOne({
      _id: this.documentId(identityId, scope),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    const document = this.toDocument(settings);
    const collection = await this.collection();

    await collection.updateOne(
      { _id: document._id },
      { $set: document },
      { upsert: true },
    );
  }
}
