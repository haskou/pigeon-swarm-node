import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
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
    const identityRepository = mock<IdentityRepository>();
    const routing = new OrbitDBDeviceAuthorizationRouting(
      identityRepository,
      networkRegistry,
    );

    return { authorization, identityId, identityRepository, routing };
  }

  async function signedIdentity(options: {
    networkIds: string[];
    previous?: IdentityExternalIdentifier;
    timestamp: number;
    version: number;
  }) {
    const owner = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const credential = DeviceCredential.fromString(
      owner.toPrimitives().publicKey,
    );
    const recoveryAuthority = RecoveryAuthority.fromString(
      recovery.toPrimitives().publicKey,
    );
    const identity = mock<Identity>();

    identity.getNetworkIds.mockReturnValue(
      options.networkIds.map((networkId) => new NetworkId(networkId)),
    );
    identity.getInitialDeviceCredential.mockReturnValue(credential);
    identity.getRecoveryAuthority.mockReturnValue(recoveryAuthority);
    identity.getVersion.mockReturnValue(new IdentityVersion(options.version));
    identity.isIdentifiedBy.mockReturnValue(true);
    identity.isFirstVersion.mockReturnValue(options.version === 1);
    identity.hasNoPreviousReference.mockReturnValue(options.version === 1);
    identity.hasInitialAuthorizationRevision.mockReturnValue(true);
    identity.getPreviousReference.mockReturnValue(options.previous);
    identity.isNextVersionAfter.mockReturnValue(true);
    identity.usesSameGenesisAuthorizationAs.mockReturnValue(true);
    identity.doesNotRollbackAuthorizationFrom.mockReturnValue(true);
    identity.keepsNetworksFrom.mockReturnValue(true);
    identity.toPrimitives.mockReturnValue({
      timestamp: options.timestamp,
    } as ReturnType<Identity['toPrimitives']>);

    return { credential, identity, recoveryAuthority };
  }

  function permutations<T>(values: T[]): T[][] {
    if (values.length <= 1) {
      return [values];
    }

    return values.flatMap((value, index) =>
      permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
        (rest) => [value, ...rest],
      ),
    );
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

  it('routes through the newest identity version and breaks ties by lowest external identifier while keeping the first provisioned genesis', async () => {
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
    expect(routing.routableNetworkIds(authorization)).toEqual(
      [privateNetworkId, publicNetworkId].sort(),
    );

    routing.remember(
      newer,
      new IdentityVersion(2),
      new IdentityExternalIdentifier('bafy-a'),
    );
    expect(trusted()).toBe(authorization);
    expect(routing.routableNetworkIds(newer)).toEqual([privateNetworkId]);

    routing.remember(
      authorization,
      new IdentityVersion(1),
      new IdentityExternalIdentifier('bafy-0'),
    );
    expect(routing.routableNetworkIds(newer)).toEqual([privateNetworkId]);
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

  it('derives the genesis from the verified version-1 identity, not the latest candidate', async () => {
    const { identityId, identityRepository, routing } = await fixture();
    const genesisIdentifier = new IdentityExternalIdentifier('bafy-v1');
    const first = await signedIdentity({
      networkIds: [privateNetworkId],
      timestamp: 10,
      version: 1,
    });
    const latest = await signedIdentity({
      networkIds: [privateNetworkId, publicNetworkId],
      previous: genesisIdentifier,
      timestamp: 20,
      version: 2,
    });
    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([
      new IdentityCandidate(
        new IdentityExternalIdentifier('bafy-v2'),
        latest.identity,
      ),
    ]);
    identityRepository.findByExternalIdentifier.mockResolvedValue(
      first.identity,
    );

    const genesis = await routing.resolveTrustedGenesis(identityId);

    expect(genesis?.getNetworkIds().map((id) => id.valueOf())).toEqual([
      privateNetworkId,
    ]);
    expect(genesis?.getCredentials()).toEqual([first.credential]);
    expect(genesis?.getRecoveryAuthority()).toEqual(first.recoveryAuthority);
    expect(routing.trustedGenesis(identityId.valueOf())).toBe(genesis);
    expect(routing.routableNetworkIds(genesis as DeviceAuthorization)).toEqual(
      [privateNetworkId, publicNetworkId].sort(),
    );
  });

  it('chooses the same version-1 fork for every candidate order', async () => {
    const { identityId, identityRepository } = await fixture();
    const forks = [
      { id: 'bafy-b', timestamp: 20 },
      { id: 'bafy-z', timestamp: 10 },
      { id: 'bafy-c', timestamp: 10 },
    ];
    const signed = await Promise.all(
      forks.map(async (fork) => ({
        ...fork,
        ...(await signedIdentity({
          networkIds: [privateNetworkId],
          timestamp: fork.timestamp,
          version: 1,
        })),
      })),
    );
    const winner = signed.find((fork) => fork.id === 'bafy-c');

    for (const ordered of permutations(signed)) {
      const routing = new OrbitDBDeviceAuthorizationRouting(
        identityRepository,
        mock<IPFSNetworkRegistry>(),
      );
      identityRepository.findFreshCandidateReferencesById.mockResolvedValue(
        ordered.map(
          (fork) =>
            new IdentityCandidate(
              new IdentityExternalIdentifier(fork.id),
              fork.identity,
            ),
        ),
      );

      const genesis = await routing.resolveTrustedGenesis(identityId);

      expect(genesis?.getCredentials()).toEqual([winner?.credential]);
      expect(genesis?.getRecoveryAuthority()).toEqual(
        winner?.recoveryAuthority,
      );
    }
  });

  it('fails closed when the identity cannot be resolved or verified', async () => {
    const { identityId, identityRepository, routing } = await fixture();
    const invalid = await signedIdentity({
      networkIds: [privateNetworkId],
      timestamp: 1,
      version: 1,
    });
    invalid.identity.isIdentifiedBy.mockReturnValue(false);

    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([]);
    await expect(routing.resolveTrustedGenesis(identityId)).resolves.toBe(
      undefined,
    );

    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([
      new IdentityCandidate(
        new IdentityExternalIdentifier('bafy-invalid'),
        invalid.identity,
      ),
    ]);
    await expect(routing.resolveTrustedGenesis(identityId)).resolves.toBe(
      undefined,
    );

    identityRepository.findFreshCandidateReferencesById.mockRejectedValue(
      new Error('unavailable'),
    );
    await expect(routing.resolveTrustedGenesis(identityId)).resolves.toBe(
      undefined,
    );
    expect(routing.trustedGenesis(identityId.valueOf())).toBeUndefined();
  });

  it('rejects a candidate whose chain does not reach a version-1 identity', async () => {
    const { identityId, identityRepository, routing } = await fixture();
    const latest = await signedIdentity({
      networkIds: [privateNetworkId],
      previous: new IdentityExternalIdentifier('bafy-missing'),
      timestamp: 2,
      version: 2,
    });
    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([
      new IdentityCandidate(
        new IdentityExternalIdentifier('bafy-v2'),
        latest.identity,
      ),
    ]);
    identityRepository.findByExternalIdentifier.mockResolvedValue(undefined);

    await expect(routing.resolveTrustedGenesis(identityId)).resolves.toBe(
      undefined,
    );
  });
});
