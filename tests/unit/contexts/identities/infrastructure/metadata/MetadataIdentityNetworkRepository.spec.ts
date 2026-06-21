import IdentityMetadataIndex from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import MetadataIdentityNetworkRepository from '@app/contexts/identities/infrastructure/metadata/MetadataIdentityNetworkRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MetadataIdentityNetworkRepository', () => {
  let metadataIndex: MockProxy<IdentityMetadataIndex>;
  let repository: MetadataIdentityNetworkRepository;

  beforeEach(() => {
    metadataIndex = mock<IdentityMetadataIndex>();
    repository = new MetadataIdentityNetworkRepository(metadataIndex);
  });

  it('should return the latest identity networks as value objects', async () => {
    const mother = new IdentityMother();
    const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

    metadataIndex.findByIdentityId.mockResolvedValue([
      {
        cid: 'bafyidentity',
        identityId: mother.id.valueOf(),
        networkIds: [networkId.valueOf()],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);

    const result = await repository.findByIdentityId(mother.id);

    expect(metadataIndex.findByIdentityId).toHaveBeenCalledWith(mother.id);
    expect(result).toEqual([networkId]);
  });

  it('should return no networks when the identity has no metadata', async () => {
    const mother = new IdentityMother();

    metadataIndex.findByIdentityId.mockResolvedValue([]);

    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([]);
  });
});
