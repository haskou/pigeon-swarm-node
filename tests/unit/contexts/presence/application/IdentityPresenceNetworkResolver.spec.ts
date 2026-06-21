import IdentityNetworksFinder from '@app/contexts/identities/application/find-networks/IdentityNetworksFinder';
import IdentityPresenceNetworkResolver from '@app/contexts/presence/application/IdentityPresenceNetworkResolver';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('IdentityPresenceNetworkResolver', () => {
  let identityNetworksFinder: MockProxy<IdentityNetworksFinder>;
  let resolver: IdentityPresenceNetworkResolver;

  beforeEach(() => {
    identityNetworksFinder = mock<IdentityNetworksFinder>();
    resolver = new IdentityPresenceNetworkResolver(identityNetworksFinder);
  });

  it('should resolve identity networks through the identities application', async () => {
    const identityId = new IdentityMother().id;
    const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

    identityNetworksFinder.find.mockResolvedValue([networkId]);

    const result = await resolver.resolve(identityId);

    expect(identityNetworksFinder.find).toHaveBeenCalledWith(identityId);
    expect(result).toEqual([networkId.valueOf()]);
  });
});
