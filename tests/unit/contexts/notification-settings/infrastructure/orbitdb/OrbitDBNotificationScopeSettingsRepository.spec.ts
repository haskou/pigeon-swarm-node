import OrbitDBNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/orbitdb/OrbitDBNotificationScopeSettingsRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { generateKeyPairSync } from 'node:crypto';

describe('OrbitDBNotificationScopeSettingsRepository', () => {
  it('ignores replicated documents with malformed notification scopes', async () => {
    const identityId = validIdentityId();
    const documents = [
      {
        hideMutedChannels: false,
        id: `${identityId.valueOf()}:invalid`,
        identityId: identityId.valueOf(),
        mobilePushEnabled: true,
        notificationLevel: 'all',
        scope: {},
        scopeKey: 'invalid',
        suppressEveryoneAndHere: false,
        suppressRoleMentions: false,
        updatedAt: Date.now(),
      },
    ];
    const registry = {
      onDocumentUpdated: jest.fn(
        async (
          _storeName: string,
          listener: (document: Record<string, unknown>) => void | Promise<void>,
        ) => {
          for (const document of documents) await listener(document);
        },
      ),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const repository = new OrbitDBNotificationScopeSettingsRepository(registry);

    await expect(repository.findByIdentityId(identityId)).resolves.toEqual([]);
  });
});

function validIdentityId(): IdentityId {
  const { publicKey } = generateKeyPairSync('ed25519');

  return new IdentityId(
    publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  );
}
