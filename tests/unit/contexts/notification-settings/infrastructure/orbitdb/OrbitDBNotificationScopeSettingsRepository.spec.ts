import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import OrbitDBNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/orbitdb/OrbitDBNotificationScopeSettingsRepository';
import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { generateKeyPairSync } from 'node:crypto';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

function createStore() {
  const entries = new Map<string, Record<string, unknown>>();

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: { on: jest.fn() },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);

        entries.set(
          key,
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument,
        );

        return key;
      },
    ),
    query: jest.fn(async (matcher) =>
      [...entries.values()].filter((document) => matcher(document)),
    ),
  };
}

function validIdentityId(): IdentityId {
  const { publicKey } = generateKeyPairSync('ed25519');

  return new IdentityId(
    publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  );
}

describe('OrbitDBNotificationScopeSettingsRepository', () => {
  const identityId = validIdentityId();
  const scope = NotificationSettingScope.community(new CommunityId('c-1'));
  const recordId = `${identityId.valueOf()}:${scope.key()}`;
  const proof = (kind: 'put' | 'delete', sequence: number) =>
    signedMutation({
      identityId: identityId.valueOf(),
      kind,
      recordId,
      sequence,
      store: 'notificationSettings',
    });
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBNotificationScopeSettingsRepository;

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: createStore(),
      notificationSettings: createStore(),
    } as never);
    repository = new OrbitDBNotificationScopeSettingsRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads saved settings back by scope and by identity', async () => {
    await repository.save(
      NotificationScopeSettings.create(
        identityId,
        scope,
        NotificationScopeSettingsPreferences.defaults(),
      ),
      await proof('put', 1),
    );

    expect((await repository.findByIdentityId(identityId)).length).toBe(1);
    expect(
      (await repository.findByScope(identityId, scope))?.getScope().key(),
    ).toBe(scope.key());
  });

  it('hides settings after a signed reset', async () => {
    await repository.save(
      NotificationScopeSettings.create(
        identityId,
        scope,
        NotificationScopeSettingsPreferences.defaults(),
      ),
      await proof('put', 1),
    );
    await repository.delete(identityId, scope, await proof('delete', 2));

    await expect(
      repository.findByScope(identityId, scope),
    ).resolves.toBeUndefined();
  });

  it('refuses to bring settings back with a proof older than the reset', async () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await repository.save(settings, await proof('put', 1));
    await repository.delete(identityId, scope, await proof('delete', 2));

    await expect(
      repository.save(settings, await proof('put', 1)),
    ).rejects.toBeInstanceOf(StalePublicMutationError);
    await expect(
      repository.findByScope(identityId, scope),
    ).resolves.toBeUndefined();
  });

  it('ignores replicated documents with malformed notification scopes', async () => {
    const registryWithBadHead = {
      findHead: jest.fn().mockResolvedValue({
        notificationSettings: [
          {
            hideMutedChannels: false,
            id: `${identityId.valueOf()}:invalid`,
            identityId: identityId.valueOf(),
            mobilePushEnabled: true,
            notificationLevel: 'all',
            scope: {},
            scopeKey: 'invalid',
            scopeType: 'notification_settings',
            suppressEveryoneAndHere: false,
            suppressRoleMentions: false,
            updatedAt: Date.now(),
          },
        ],
      }),
    } as unknown as OrbitDBReplicatedStateRegistry;

    await expect(
      new OrbitDBNotificationScopeSettingsRepository(
        registryWithBadHead,
      ).findByIdentityId(identityId),
    ).resolves.toEqual([]);
  });
});
