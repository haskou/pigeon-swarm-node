import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import OrbitDBDeviceAuthorizationRouting from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRouting';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe(OrbitDBDeviceAuthorizationRouting.name, () => {
  const privateNetworkId = '550e8400-e29b-41d4-a716-446655440000';
  const publicNetworkId = '660e8400-e29b-41d4-a716-446655440000';

  async function fixture() {
    const owner = await KeyPair.generate();
    const identity = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId(publicNetworkId), new NetworkId(privateNetworkId)],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    const privateNetwork = mock<IPFSNetwork>();
    privateNetwork.getId.mockReturnValue(privateNetworkId);
    privateNetwork.isPrivate.mockReturnValue(true);
    const publicNetwork = mock<IPFSNetwork>();
    publicNetwork.getId.mockReturnValue(publicNetworkId);
    publicNetwork.isPrivate.mockReturnValue(false);
    const networkRegistry = mock<IPFSNetworkRegistry>();
    networkRegistry.getAll.mockReturnValue([privateNetwork, publicNetwork]);
    const routing = new OrbitDBDeviceAuthorizationRouting(
      mock<IdentityRepository>(),
      networkRegistry,
    );

    return { authorization, identityId, routing };
  }

  it('routes only through registered private networks', async () => {
    const { authorization, routing } = await fixture();

    expect(routing.networkIds(authorization)).toEqual(
      [privateNetworkId, publicNetworkId].sort(),
    );
    expect(
      routing.privateNetworkIds(routing.networkIds(authorization)),
    ).toEqual([privateNetworkId]);
    expect(routing.isPrivateNetwork(privateNetworkId)).toBe(true);
    expect(routing.isPrivateNetwork(publicNetworkId)).toBe(false);
    expect(routing.isPrivateNetwork('unknown')).toBe(false);
  });

  it('keeps the newest identity version and breaks ties by lowest external identifier', async () => {
    const { authorization, identityId, routing } = await fixture();
    const trusted = (): DeviceAuthorization | undefined =>
      routing.trustedGenesis(identityId.valueOf());
    const newer = DeviceAuthorization.fromPrimitives({
      ...authorization.toPrimitives(),
      networkIds: [privateNetworkId],
    });

    routing.remember(
      authorization,
      new IdentityVersion(2),
      new IdentityExternalIdentifier('bafy-b'),
    );
    expect(trusted()).toBe(authorization);

    routing.remember(
      newer,
      new IdentityVersion(2),
      new IdentityExternalIdentifier('bafy-c'),
    );
    expect(trusted()).toBe(authorization);

    routing.remember(
      newer,
      new IdentityVersion(2),
      new IdentityExternalIdentifier('bafy-a'),
    );
    expect(trusted()).toBe(newer);
    expect(routing.routableNetworkIds(newer)).toEqual([privateNetworkId]);

    routing.remember(
      authorization,
      new IdentityVersion(1),
      new IdentityExternalIdentifier('bafy-0'),
    );
    expect(trusted()).toBe(newer);
  });

  it('forgets routing only for the matching identity version and external identifier', async () => {
    const { authorization, identityId, routing } = await fixture();

    routing.remember(
      authorization,
      new IdentityVersion(3),
      new IdentityExternalIdentifier('bafy-a'),
    );

    routing.forget(
      identityId,
      new IdentityVersion(2),
      new IdentityExternalIdentifier('bafy-a'),
    );
    expect(routing.trustedGenesis(identityId.valueOf())).toBe(authorization);

    routing.forget(
      identityId,
      new IdentityVersion(3),
      new IdentityExternalIdentifier('bafy-a'),
    );
    expect(routing.trustedGenesis(identityId.valueOf())).toBeUndefined();
  });
});
