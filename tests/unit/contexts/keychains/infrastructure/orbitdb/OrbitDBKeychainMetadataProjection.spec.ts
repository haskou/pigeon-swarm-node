import OrbitDBKeychainMetadataIndex from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataIndex';
import OrbitDBKeychainMetadataProjection from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataProjection';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

describe('OrbitDBKeychainMetadataProjection', () => {
  let metadataIndex: MockProxy<OrbitDBKeychainMetadataIndex>;
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let projection: OrbitDBKeychainMetadataProjection;

  beforeEach(() => {
    metadataIndex = mock<OrbitDBKeychainMetadataIndex>();
    registry = mock<OrbitDBReplicatedStateRegistry>();
    registry.onDocumentUpdated.mockResolvedValue();
    projection = new OrbitDBKeychainMetadataProjection(registry, metadataIndex);
  });

  it('projects replicated keychain documents', async () => {
    let listener: (document: Record<string, unknown>) => void = () => undefined;
    const document = {
      cid: 'bafy-keychain-v2',
      ownerIdentityId: 'identity-1',
      version: 2,
    };

    registry.onDocumentUpdated.mockImplementation((_, candidate) => {
      listener = candidate;

      return Promise.resolve();
    });

    await projection.start();
    listener(document);

    expect(metadataIndex.projectDocument).toHaveBeenCalledWith(document);
  });

  it('subscribes to keychain documents only once', async () => {
    await Promise.all([projection.start(), projection.start()]);

    expect(registry.onDocumentUpdated).toHaveBeenCalledTimes(1);
    expect(registry.onDocumentUpdated).toHaveBeenCalledWith(
      'keychains',
      expect.any(Function),
    );
  });
});
