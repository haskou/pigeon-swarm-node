import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationSettingsStorageQuota } from '@app/contexts/notification-settings/domain/NotificationSettingsStorageQuota';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Integer } from '@haskou/value-objects';

export default class LocalNotificationScopeSettingsRepository {
  private static readonly NAMESPACE = 'private_notification_scope_settings';
  private static readonly queues = new WeakMap<
    EmbeddedLocalDatabase,
    Promise<void>
  >();

  public constructor(private readonly database: EmbeddedLocalDatabase) {}

  private async exclusively<T>(action: () => Promise<T>): Promise<T> {
    const previous =
      LocalNotificationScopeSettingsRepository.queues.get(this.database) ??
      Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    LocalNotificationScopeSettingsRepository.queues.set(this.database, tail);
    await previous;

    try {
      return await action();
    } finally {
      release();

      if (
        LocalNotificationScopeSettingsRepository.queues.get(this.database) ===
        tail
      ) {
        LocalNotificationScopeSettingsRepository.queues.delete(this.database);
      }
    }
  }

  private documentId(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): string {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  private isDocument(document: Record<string, unknown>): boolean {
    return (
      this.hasIdentityFields(document) &&
      this.hasPreferenceFields(document) &&
      (document.mutedUntil === undefined ||
        document.mutedUntil === null ||
        typeof document.mutedUntil === 'number') &&
      typeof document.scope === 'object' &&
      document.scope !== null &&
      typeof document.updatedAt === 'number'
    );
  }

  private hasIdentityFields(document: Record<string, unknown>): boolean {
    return (
      typeof document._id === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.scopeKey === 'string'
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

  private async toDomain(
    document: Record<string, unknown>,
  ): Promise<NotificationScopeSettings | undefined> {
    if (!this.isDocument(document)) {
      await this.remove(document);

      return undefined;
    }

    try {
      return NotificationScopeSettings.fromPrimitives(
        document as ReturnType<NotificationScopeSettings['toPrimitives']>,
      );
    } catch {
      await this.remove(document);

      return undefined;
    }
  }

  private async remove(document: Record<string, unknown>): Promise<void> {
    if (typeof document._id === 'string') {
      await this.database.delete(
        LocalNotificationScopeSettingsRepository.NAMESPACE,
        document._id,
      );
    }
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    await this.database.delete(
      LocalNotificationScopeSettingsRepository.NAMESPACE,
      this.documentId(identityId, scope),
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    const documents = await this.database.find(
      LocalNotificationScopeSettingsRepository.NAMESPACE,
      (document) => document.identityId === identityId.valueOf(),
    );
    const settings = await Promise.all(
      documents.map((document) => this.toDomain(document)),
    );

    return settings
      .filter((value): value is NotificationScopeSettings => Boolean(value))
      .sort(
        (left, right) =>
          right.toPrimitives().updatedAt - left.toPrimitives().updatedAt,
      );
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    const document = await this.database.findOne(
      LocalNotificationScopeSettingsRepository.NAMESPACE,
      this.documentId(identityId, scope),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    const primitives = settings.toPrimitives();
    const id = this.documentId(settings.getIdentityId(), settings.getScope());

    await this.exclusively(async () => {
      const existing = await this.database.findOne(
        LocalNotificationScopeSettingsRepository.NAMESPACE,
        id,
      );

      if (!existing) {
        const documents = await this.database.find(
          LocalNotificationScopeSettingsRepository.NAMESPACE,
        );
        const identitySettings = documents.filter(
          (document) =>
            document.identityId === settings.getIdentityId().valueOf(),
        );
        const quota = new NotificationSettingsStorageQuota(
          new Integer(documents.length),
          new Integer(identitySettings.length),
        );
        quota.reserve();
      }

      await this.database.save(
        LocalNotificationScopeSettingsRepository.NAMESPACE,
        id,
        { ...primitives },
      );
    });
  }
}
