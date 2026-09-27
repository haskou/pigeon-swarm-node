import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import { NotificationSettingsStorageCapacityExceededError } from '@app/contexts/notification-settings/domain/errors/NotificationSettingsStorageCapacityExceededError';
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
      find: jest.fn(async (_namespace: string, matcher = () => true) =>
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

  it('bounds the number of settings stored for one identity', async () => {
    for (let index = 0; index < 256; index++) {
      await repository.save(
        NotificationScopeSettings.create(
          identityId,
          NotificationSettingScope.community(
            new CommunityId(`private-community-${index}`),
          ),
          NotificationScopeSettingsPreferences.defaults(),
        ),
      );
    }

    await expect(
      repository.save(
        NotificationScopeSettings.create(
          identityId,
          NotificationSettingScope.community(
            new CommunityId('private-community-0'),
          ),
          NotificationScopeSettingsPreferences.defaults(),
        ),
      ),
    ).resolves.toBeUndefined();

    await expect(
      repository.save(
        NotificationScopeSettings.create(
          identityId,
          NotificationSettingScope.community(
            new CommunityId('private-community-overflow'),
          ),
          NotificationScopeSettingsPreferences.defaults(),
        ),
      ),
    ).rejects.toThrow(NotificationSettingsStorageCapacityExceededError);
  });

  it('serializes concurrent quota reservations', async () => {
    for (let index = 0; index < 255; index++) {
      documents.set(`existing-${index}`, {
        _id: `existing-${index}`,
        identityId: identityId.valueOf(),
      });
    }
    const candidates = ['candidate-a', 'candidate-b'].map((communityId) =>
      NotificationScopeSettings.create(
        identityId,
        NotificationSettingScope.community(new CommunityId(communityId)),
        NotificationScopeSettingsPreferences.defaults(),
      ),
    );

    const results = await Promise.allSettled(
      candidates.map((settings) => repository.save(settings)),
    );

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('bounds the total number of settings stored on the node', async () => {
    for (let index = 0; index < 4096; index++) {
      documents.set(`existing-${index}`, {
        _id: `existing-${index}`,
        identityId: `identity-${index}`,
      });
    }

    await expect(
      repository.save(
        NotificationScopeSettings.create(
          identityId,
          scope,
          NotificationScopeSettingsPreferences.defaults(),
        ),
      ),
    ).rejects.toThrow(NotificationSettingsStorageCapacityExceededError);
  });
});

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString(),
  );
}
