import OrbitDBNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/orbitdb/OrbitDBNotificationScopeSettingsRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { generateKeyPairSync } from 'node:crypto';

describe('OrbitDBNotificationScopeSettingsRepository', () => {
  it('ignores replicated documents with malformed identity identifiers', async () => {
    const documents = [{ identityId: 'malformed-public-key' }];
    const registry = {
      queryDocuments: jest.fn(
        async (
          _storeName: string,
          matcher: (document: Record<string, unknown>) => boolean,
        ) => documents.filter(matcher),
      ),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const repository = new OrbitDBNotificationScopeSettingsRepository(registry);
    const identityId = validIdentityId();

    await expect(repository.findByIdentityId(identityId)).resolves.toEqual([]);
  });
});

function validIdentityId(): IdentityId {
  const { publicKey } = generateKeyPairSync('ed25519');

  return new IdentityId(
    publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  );
}
