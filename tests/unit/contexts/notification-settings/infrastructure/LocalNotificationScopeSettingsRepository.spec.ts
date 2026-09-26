import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import LocalNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/local-db/LocalNotificationScopeSettingsRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { generateKeyPairSync } from 'node:crypto';

describe('LocalNotificationScopeSettingsRepository', () => {
  const identityId = validIdentityId();
  const scope = NotificationSettingScope.community(
    new CommunityId('private-community'),
  );
  let documents: Map<string, Record<string, unknown>>;
  let database: jest.Mocked<EmbeddedLocalDatabase>;
  let repository: LocalNotificationScopeSettingsRepository;

  beforeEach(() => {
    documents = new Map();
    database = {
      delete: jest.fn(async (_namespace: string, id: string) => {
        documents.delete(id);
      }),
      find: jest.fn(async (_namespace: string, matcher) =>
        [...documents.values()].filter(matcher),
      ),
      findOne: jest.fn(async (_namespace: string, id: string) =>
        documents.get(id),
      ),
      save: jest.fn(
        async (
          _namespace: string,
          id: string,
          document: Record<string, unknown>,
        ) => {
          documents.set(id, { ...document, _id: id });
        },
      ),
    } as unknown as jest.Mocked<EmbeddedLocalDatabase>;
    repository = new LocalNotificationScopeSettingsRepository(database);
  });

  it('persists, reads and deletes settings without replicated storage', async () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await repository.save(settings);

    await expect(
      repository
        .findByScope(identityId, scope)
        .then((value) => value?.toPrimitives()),
    ).resolves.toEqual(settings.toPrimitives());
    await expect(
      repository
        .findByIdentityId(identityId)
        .then((values) => values.map((value) => value.toPrimitives())),
    ).resolves.toEqual([settings.toPrimitives()]);

    await repository.delete(identityId, scope);

    await expect(
      repository.findByScope(identityId, scope),
    ).resolves.toBeUndefined();
  });
});

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString(),
  );
}
