import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

describe('OrbitDBIdentityMetadataProjection', () => {
  let metadataIndex: MockProxy<OrbitDBIdentityMetadataIndex>;
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let projection: OrbitDBIdentityMetadataProjection;

  beforeEach(() => {
    metadataIndex = mock<OrbitDBIdentityMetadataIndex>();
    registry = mock<OrbitDBReplicatedStateRegistry>();
    registry.onDocumentUpdated.mockResolvedValue();
    projection = new OrbitDBIdentityMetadataProjection(registry, metadataIndex);
  });

  it('projects replicated identity documents', async () => {
    let listener: (document: Record<string, unknown>) => void = () => undefined;
    const document = {
      cid: 'bafy-identity-v2',
      identityId: 'identity-1',
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

  it('subscribes to identity documents only once', async () => {
    await Promise.all([projection.start(), projection.start()]);

    expect(registry.onDocumentUpdated).toHaveBeenCalledTimes(1);
    expect(registry.onDocumentUpdated).toHaveBeenCalledWith(
      'identities',
      expect.any(Function),
    );
  });
});
