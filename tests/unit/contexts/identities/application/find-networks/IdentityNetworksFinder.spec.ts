import IdentityNetworksFinder from '@app/contexts/identities/application/find-networks/IdentityNetworksFinder';
import IdentityNetworkRepository from '@app/contexts/identities/domain/repositories/IdentityNetworkRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityNetworksFinder', () => {
  let repository: MockProxy<IdentityNetworkRepository>;
  let finder: IdentityNetworksFinder;

  beforeEach(() => {
    repository = mock<IdentityNetworkRepository>();
    finder = new IdentityNetworksFinder(repository);
  });

  it('should return the identity networks from the repository', async () => {
    const identityId: IdentityId = new IdentityMother().id;
    const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

    repository.findByIdentityId.mockResolvedValue([networkId]);

    const result = await finder.find(identityId);

    expect(repository.findByIdentityId).toHaveBeenCalledWith(identityId);
    expect(result).toEqual([networkId]);
  });
});
