import OrbitDBContentReplicationRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBContentReplicationRepository';
import OrbitDBContentReplicationMapper from '@app/contexts/content-replication/infrastructure/orbitdb/mappers/OrbitDBContentReplicationMapper';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { MockProxy, mock } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBContentReplicationRepository', () => {
  const owner = new IdentityMother().id.valueOf();
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  const registration = (): Record<string, unknown> => ({
    cid: 'bafkreiacontent',
    context: 'ipfs_public_upload',
    id: `content:${networkId}:bafkreiacontent`,
    networkId,
    ownerIdentityId: owner,
    scopeType: 'content_replication',
    sizeBytes: 1024,
  });
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let repository: OrbitDBContentReplicationRepository;

  beforeEach(() => {
    registry = mock<OrbitDBReplicatedStateRegistry>();
    repository = new OrbitDBContentReplicationRepository(
      registry,
      new OrbitDBContentReplicationMapper(),
    );
  });

  it('lists the registrations that the registry admits', async () => {
    registry.queryDocuments.mockResolvedValue([registration()]);

    const contents = await repository.findAll();

    expect(contents.map((content) => content.getCid().valueOf())).toEqual([
      'bafkreiacontent',
    ]);
  });

  it('lists a registration whose document identifier is absent', async () => {
    registry.queryDocuments.mockResolvedValue([
      { ...registration(), id: undefined },
    ]);

    const contents = await repository.findAll();

    expect(contents.map((content) => content.getCid().valueOf())).toEqual([
      'bafkreiacontent',
    ]);
  });

  it.each([
    ['a missing owner', { ownerIdentityId: undefined }],
    ['a textual size', { sizeBytes: '1024' }],
    ['a numeric CID', { cid: 1 }],
  ])('does not list a registration with %s', async (_label, change) => {
    registry.queryDocuments.mockResolvedValue([
      { ...registration(), ...change },
    ]);

    await expect(repository.findAll()).resolves.toEqual([]);
  });
});
