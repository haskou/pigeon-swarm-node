import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import OrbitDBLegacyPrivateUploadRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBLegacyPrivateUploadRepository';
import ContentReplicationMutationPolicy from '@app/contexts/content-replication/infrastructure/orbitdb/policies/ContentReplicationMutationPolicy';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { MockProxy, mock } from 'jest-mock-extended';

describe('OrbitDBLegacyPrivateUploadRepository', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  const legacy = (
    cid: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    cid,
    context: 'ipfs_private_upload',
    id: `content:${networkId}:${cid}`,
    networkId,
    ownerIdentityId: 'owner',
    scopeType: 'content_replication',
    sizeBytes: 1024,
    ...overrides,
  });
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let policy: MockProxy<ContentReplicationMutationPolicy>;
  let repository: OrbitDBLegacyPrivateUploadRepository;

  beforeEach(() => {
    registry = mock<OrbitDBReplicatedStateRegistry>();
    policy = mock<ContentReplicationMutationPolicy>();
    repository = new OrbitDBLegacyPrivateUploadRepository(registry, policy);
  });

  it('lists only the legacy uploads whose proof verifies', async () => {
    registry.queryUnadmittedDocuments.mockResolvedValue([
      legacy('bafkreigenuine'),
      legacy('bafkreiforged'),
    ]);
    policy.isGenuine.mockImplementation((record) =>
      Promise.resolve(record.cid === 'bafkreigenuine'),
    );

    await expect(repository.findGenuine()).resolves.toEqual([
      {
        cid: new ContentId('bafkreigenuine'),
        networkId: new NetworkId(networkId),
      },
    ]);
  });

  it('lists a legacy upload once per network and CID', async () => {
    registry.queryUnadmittedDocuments.mockResolvedValue([
      legacy('bafkreigenuine'),
      legacy('bafkreigenuine'),
    ]);
    policy.isGenuine.mockResolvedValue(true);

    await expect(repository.findGenuine()).resolves.toHaveLength(1);
  });

  it('reads only unadmitted legacy private-upload records that are not tombstones', async () => {
    registry.queryUnadmittedDocuments.mockResolvedValue([]);

    await repository.findGenuine();

    expect(registry.queryUnadmittedDocuments).toHaveBeenCalledWith(
      'contentReplication',
      expect.any(Function),
    );
    const matcher = registry.queryUnadmittedDocuments.mock.calls[0][1];
    expect(matcher(legacy('bafkreiacontent'))).toBe(true);
    expect(
      matcher(legacy('bafkreiacontent', { context: 'ipfs_public_upload' })),
    ).toBe(false);
    expect(matcher(legacy('bafkreiacontent', { removed: true }))).toBe(false);
  });
});
