import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import OrbitDBDeviceAuthorizationRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBHeadRecordMerger } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadRecordMerger';
import { OrbitDBHeadRecordScope } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadRecordScope';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe(OrbitDBDeviceAuthorizationRepository.name, () => {
  const now = new Timestamp(1_800_000_000_000);
  const genesisExternalIdentifier = new IdentityExternalIdentifier(
    'bafy-genesis',
  );

  async function fixture() {
    const owner = await KeyPair.generate();
    const identity = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const genesis = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );

    return { genesis, identityId, owner, recovery };
  }

  function repositoryFixture() {
    const registry = mock<OrbitDBReplicatedStateRegistry>();
    const identityRepository = mock<IdentityRepository>();
    const networkRegistry = mock<IPFSNetworkRegistry>();
    const privateNetwork = mock<IPFSNetwork>();
    let head: Record<string, unknown> | undefined;
    let merger: OrbitDBHeadRecordMerger | undefined;
    let scope: OrbitDBHeadRecordScope | undefined;
    privateNetwork.getId.mockReturnValue(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    privateNetwork.isPrivate.mockReturnValue(true);
    networkRegistry.getAll.mockReturnValue([privateNetwork]);

    registry.registerHeadRecordMerger.mockImplementation(
      (_prefix, value, recordScope) => {
        merger = value;
        scope = recordScope;
      },
    );
    registry.findHead.mockImplementation(() => Promise.resolve(head));
    registry.putDocument.mockResolvedValue();
    registry.putHead.mockImplementation((_key, value) => {
      head = head && merger ? merger(head, value) : value;

      return Promise.resolve();
    });

    return {
      getHead: () => head,
      getMerger: () => merger,
      getScope: () => scope,
      identityRepository,
      networkRegistry,
      registry,
      repository: new OrbitDBDeviceAuthorizationRepository(
        registry,
        new DeviceAuthorizationPolicy(),
        identityRepository,
        networkRegistry,
      ),
      setHead: (value: Record<string, unknown>): void => {
        head = value;
      },
    };
  }

  function privateNetwork(networkId: string): MockProxy<IPFSNetwork> {
    const network = mock<IPFSNetwork>();

    network.getId.mockReturnValue(networkId);
    network.isPrivate.mockReturnValue(true);

    return network;
  }

  function provisionAuthorization(
    repository: OrbitDBDeviceAuthorizationRepository,
    authorization: DeviceAuthorization,
    version = 1,
    externalIdentifier = genesisExternalIdentifier,
  ): Promise<void> {
    return repository.provision(
      authorization,
      new IdentityVersion(version),
      externalIdentifier,
    );
  }

  function enrollment(
    identityId: IdentityId,
    owner: KeyPair,
    target: KeyPair,
    operationId: string,
    pairingId: string,
    previousRevision = DeviceAuthorizationRevision.initial(),
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      previousRevision,
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        new PairingId(pairingId),
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );

    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(owner.sign(proven.getSigningPayload()));
  }

  it('atomically persists an accepted transition and rejects its replay', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { registry, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);

    const applied = await repository.compareAndApply(transition);

    expect(applied.getRevision().valueOf()).toBe(1);
    expect(registry.putDocument).toHaveBeenLastCalledWith(
      'identities',
      expect.objectContaining({
        id: `device-authorization:${identityId.valueOf()}`,
        identityId: identityId.valueOf(),
      }),
      expect.any(Array),
    );
    await expect(repository.compareAndApply(transition)).rejects.toThrow();
  });

  it('replicates authorization state only through registered private networks', async () => {
    const { genesis, identityId } = await fixture();
    const publicNetworkId = '550e8400-e29b-41d4-a716-446655440099';
    const publicNetwork = mock<IPFSNetwork>();
    const { getScope, networkRegistry, registry, repository } =
      repositoryFixture();
    publicNetwork.getId.mockReturnValue(publicNetworkId);
    publicNetwork.isPrivate.mockReturnValue(false);
    networkRegistry.getAll.mockReturnValue([
      ...networkRegistry.getAll(),
      publicNetwork,
    ]);
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [...genesis.getNetworkIds(), new NetworkId(publicNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );

    await provisionAuthorization(repository, authorization);

    expect(registry.putDocument).toHaveBeenCalledWith(
      'identities',
      expect.any(Object),
      ['550e8400-e29b-41d4-a716-446655440000'],
    );
    expect(registry.putHead).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      ['550e8400-e29b-41d4-a716-446655440000'],
    );
    expect(getScope()?.(publicNetworkId, { trusted: false })).toBeUndefined();
    expect(
      getScope()?.('550e8400-e29b-41d4-a716-446655440000', {
        trusted: true,
      }),
    ).toEqual({ trusted: true });
  });

  it('fails closed when authorization has no registered private network', async () => {
    const { genesis, identityId } = await fixture();
    const publicNetworkId = '550e8400-e29b-41d4-a716-446655440099';
    const publicNetwork = mock<IPFSNetwork>();
    const { networkRegistry, registry, repository } = repositoryFixture();
    publicNetwork.getId.mockReturnValue(publicNetworkId);
    publicNetwork.isPrivate.mockReturnValue(false);
    networkRegistry.getAll.mockReturnValue([publicNetwork]);
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId(publicNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );

    await expect(
      provisionAuthorization(repository, authorization),
    ).rejects.toThrow();
    expect(registry.putDocument).not.toHaveBeenCalled();
    expect(registry.putHead).not.toHaveBeenCalled();
  });

  it('rejects an enrollment first submitted after pairing expiration', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { repository } = repositoryFixture();
    const authorizedAt = new Timestamp(Date.now() - 2_000);
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Date.now() - 1_000),
        authorizedAt,
      ),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );
    const transition = proven.authorize(owner.sign(proven.getSigningPayload()));
    await provisionAuthorization(repository, genesis);

    await expect(repository.compareAndApply(transition)).rejects.toThrow();
  });

  it('replays a fully signed enrollment after an offline transport delay', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const authorizedAt = new Timestamp(Date.now() - 2_000);
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Date.now() - 1_000),
        authorizedAt,
      ),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );
    const transition = proven.authorize(owner.sign(proven.getSigningPayload()));
    const authorization = new DeviceAuthorizationPolicy().apply(
      genesis,
      transition,
    );
    await provisionAuthorization(repository, genesis);

    const merged = getMerger()?.(getHead(), {
      authorization: authorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [{ transition: transition.toPrimitives() }],
      id: `device-authorization:${identityId.valueOf()}`,
      identityId: identityId.valueOf(),
      kind: 'device_authorization',
    }) as { authorization?: { revision?: number } };

    expect(merged.authorization?.revision).toBe(1);
  });

  it('consumes a pairing identifier even when the operation identifier changes', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const otherTarget = await KeyPair.generate();
    const { repository } = repositoryFixture();
    const pairingId = '10000000-0000-4000-8000-000000000001';
    const accepted = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      pairingId,
    );
    const replay = await enrollment(
      identityId,
      owner,
      otherTarget,
      '00000000-0000-4000-8000-000000000002',
      pairingId,
    );
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(accepted);

    await expect(repository.compareAndApply(replay)).rejects.toThrow();
  });

  it('converges concurrent transitions independently of arrival order', async () => {
    const { genesis, identityId, owner } = await fixture();
    const firstTarget = await KeyPair.generate();
    const secondTarget = await KeyPair.generate();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const lexicographicWinner = await enrollment(
      identityId,
      owner,
      firstTarget,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    const other = await enrollment(
      identityId,
      owner,
      secondTarget,
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
    );
    await provisionAuthorization(first.repository, genesis);
    await provisionAuthorization(second.repository, genesis);
    await first.repository.compareAndApply(lexicographicWinner);
    await second.repository.compareAndApply(other);

    const mergedFromFirst = first.getMerger()?.(
      first.getHead(),
      second.getHead() ?? {},
    );
    const mergedFromSecond = second.getMerger()?.(
      second.getHead(),
      first.getHead() ?? {},
    );

    expect(mergedFromFirst).toEqual(mergedFromSecond);
    expect(mergedFromFirst).toMatchObject({
      authorization: {
        credentials: expect.arrayContaining([
          firstTarget.toPrimitives().publicKey,
          secondTarget.toPrimitives().publicKey,
        ]),
        revision: 1,
      },
    });
  });

  it('converges when valid histories exceed the replay limit after merging', async () => {
    const { genesis, identityId, owner } = await fixture();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const targets = await Promise.all(
      Array.from({ length: 257 }, () => KeyPair.generate()),
    );
    const transitions = await Promise.all(
      targets
        .slice(0, 256)
        .map((target, index) =>
          enrollment(
            identityId,
            owner,
            target,
            `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          ),
        ),
    );
    const descendant = await enrollment(
      identityId,
      owner,
      targets[256],
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      new DeviceAuthorizationRevision(1),
    );
    const firstTransitions = transitions.slice(0, 128);
    const secondTransitions = transitions.slice(128);
    const policy = new DeviceAuthorizationPolicy();
    const firstAuthorization = genesis.enrollConcurrently(
      firstTransitions.map((transition) => transition.getTargetCredential()),
    );
    const secondRevision = genesis.enrollConcurrently(
      secondTransitions.map((transition) => transition.getTargetCredential()),
    );
    const secondAuthorization = policy.apply(secondRevision, descendant);

    await provisionAuthorization(first.repository, genesis);
    await provisionAuthorization(second.repository, genesis);
    first.setHead({
      authorization: firstAuthorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: firstTransitions.map((transition) => ({
        transition: transition.toPrimitives(),
      })),
      id: `device-authorization:${identityId.valueOf()}`,
      identityId: identityId.valueOf(),
      kind: 'device_authorization',
    });
    second.setHead({
      authorization: secondAuthorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [
        ...secondTransitions.map((transition) => ({
          transition: transition.toPrimitives(),
        })),
        { transition: descendant.toPrimitives() },
      ],
      id: `device-authorization:${identityId.valueOf()}`,
      identityId: identityId.valueOf(),
      kind: 'device_authorization',
    });

    const mergedFromFirst = first.getMerger()?.(
      first.getHead(),
      second.getHead() ?? {},
    );
    const mergedFromSecond = second.getMerger()?.(
      second.getHead(),
      first.getHead() ?? {},
    );

    expect(mergedFromFirst).toEqual(mergedFromSecond);
    expect(mergedFromFirst).toEqual(first.getHead());
  }, 30_000);

  it('keeps the branch with a valid descendant revocation', async () => {
    const { genesis, identityId, owner } = await fixture();
    const revoker = await KeyPair.generate();
    const sibling = await KeyPair.generate();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const revokerEnrollment = await enrollment(
      identityId,
      owner,
      revoker,
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
    );
    const siblingEnrollment = await enrollment(
      identityId,
      owner,
      sibling,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(first.repository, genesis);
    await provisionAuthorization(second.repository, genesis);
    await first.repository.compareAndApply(revokerEnrollment);
    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000003',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(revoker.toPrimitives().publicKey),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );
    await first.repository.compareAndApply(
      revocation.authorize(revoker.sign(revocation.getSigningPayload())),
    );
    await second.repository.compareAndApply(siblingEnrollment);

    const merged = first.getMerger()?.(
      first.getHead(),
      second.getHead() ?? {},
    ) as { authorization?: { credentials?: string[]; revision?: number } };

    expect(merged.authorization?.revision).toBe(2);
    expect(merged.authorization?.credentials).toContain(
      revoker.toPrimitives().publicKey,
    );
    expect(merged.authorization?.credentials).not.toContain(
      owner.toPrimitives().publicKey,
    );
    expect(merged.authorization?.credentials).toContain(
      sibling.toPrimitives().publicKey,
    );
  });

  it('does not let a longer enrollment branch restore a revoked credential', async () => {
    const { genesis, identityId, owner } = await fixture();
    const revoker = await KeyPair.generate();
    const attacker = await KeyPair.generate();
    const descendant = await KeyPair.generate();
    const laterDescendant = await KeyPair.generate();
    const honest = repositoryFixture();
    const malicious = repositoryFixture();
    const revokerEnrollment = await enrollment(
      identityId,
      owner,
      revoker,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    const attackerEnrollment = await enrollment(
      identityId,
      owner,
      attacker,
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
    );
    await provisionAuthorization(honest.repository, genesis);
    await provisionAuthorization(malicious.repository, genesis);
    await honest.repository.compareAndApply(revokerEnrollment);
    await malicious.repository.compareAndApply(attackerEnrollment);

    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000003',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(revoker.toPrimitives().publicKey),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );
    await honest.repository.compareAndApply(
      revocation.authorize(revoker.sign(revocation.getSigningPayload())),
    );
    await malicious.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        descendant,
        '00000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000004',
        new DeviceAuthorizationRevision(1),
      ),
    );
    await malicious.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        laterDescendant,
        '00000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000005',
        new DeviceAuthorizationRevision(2),
      ),
    );

    const merged = honest.getMerger()?.(
      honest.getHead(),
      malicious.getHead() ?? {},
    ) as { authorization?: { credentials?: string[]; revision?: number } };
    const reversed = malicious.getMerger()?.(
      malicious.getHead(),
      honest.getHead() ?? {},
    );

    expect(merged).toEqual(reversed);
    expect(merged.authorization?.revision).toBe(2);
    expect(merged.authorization?.credentials).not.toContain(
      owner.toPrimitives().publicKey,
    );
    expect(merged.authorization?.credentials).toContain(
      revoker.toPrimitives().publicKey,
    );
  });

  it('applies every concurrent revocation before any sibling enrollment', async () => {
    const { genesis, identityId, owner } = await fixture();
    const attacker = await KeyPair.generate();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const enrolled = await enrollment(
      identityId,
      owner,
      attacker,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(first.repository, genesis);
    await first.repository.compareAndApply(enrolled);
    second.setHead(first.getHead() ?? {});
    await provisionAuthorization(second.repository, genesis);
    const revokeAttacker = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000003',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(attacker.toPrimitives().publicKey),
    );
    const revokeOwner = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(attacker.toPrimitives().publicKey),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );
    await first.repository.compareAndApply(
      revokeAttacker.authorize(owner.sign(revokeAttacker.getSigningPayload())),
    );
    await second.repository.compareAndApply(
      revokeOwner.authorize(attacker.sign(revokeOwner.getSigningPayload())),
    );

    const merged = first.getMerger()?.(
      first.getHead(),
      second.getHead() ?? {},
    ) as { authorization?: { credentials?: string[]; revision?: number } };

    expect(merged.authorization?.revision).toBe(2);
    expect(merged.authorization?.credentials).toEqual([]);
  });

  it('preserves a revocation when a sibling enrollment reuses its operation identifier', async () => {
    const { genesis, identityId, owner } = await fixture();
    const revoked = await KeyPair.generate();
    const enrolled = await KeyPair.generate();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const initialEnrollment = await enrollment(
      identityId,
      owner,
      revoked,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(first.repository, genesis);
    await first.repository.compareAndApply(initialEnrollment);
    second.setHead(first.getHead() ?? {});
    await provisionAuthorization(second.repository, genesis);
    const operationId = new DeviceAuthorizationOperationId(
      '00000000-0000-4000-8000-000000000002',
    );
    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      operationId,
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(revoked.toPrimitives().publicKey),
    );
    const unsignedEnrollment = DeviceAuthorizationTransition.enrollment(
      identityId,
      operationId,
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(enrolled.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );
    const provenEnrollment = unsignedEnrollment.provePossession(
      enrolled.sign(unsignedEnrollment.getProofOfPossessionPayload()),
    );
    await first.repository.compareAndApply(
      revocation.authorize(owner.sign(revocation.getSigningPayload())),
    );
    await second.repository.compareAndApply(
      provenEnrollment.authorize(
        owner.sign(provenEnrollment.getSigningPayload()),
      ),
    );

    const merged = first.getMerger()?.(
      first.getHead(),
      second.getHead() ?? {},
    ) as { authorization?: { credentials?: string[]; revision?: number } };

    expect(merged.authorization?.revision).toBe(2);
    expect(merged.authorization?.credentials).not.toContain(
      revoked.toPrimitives().publicKey,
    );
    expect(merged.authorization?.credentials).not.toContain(
      enrolled.toPrimitives().publicKey,
    );
  });

  it('returns the checkpoint produced by a concurrent head merge', async () => {
    const { genesis, identityId, owner } = await fixture();
    const revoked = await KeyPair.generate();
    const enrolled = await KeyPair.generate();
    const local = repositoryFixture();
    const remote = repositoryFixture();
    const initialEnrollment = await enrollment(
      identityId,
      owner,
      revoked,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(local.repository, genesis);
    await local.repository.compareAndApply(initialEnrollment);
    remote.setHead(local.getHead() ?? {});
    await provisionAuthorization(remote.repository, genesis);
    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(revoked.toPrimitives().publicKey),
    );
    await remote.repository.compareAndApply(
      revocation.authorize(owner.sign(revocation.getSigningPayload())),
    );
    const remoteHead = remote.getHead();
    const unsignedSiblingEnrollment = DeviceAuthorizationTransition.enrollment(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000003',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(enrolled.toPrimitives().publicKey),
      new PairingAuthorization(
        new PairingId('10000000-0000-4000-8000-000000000002'),
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );
    const provenSiblingEnrollment = unsignedSiblingEnrollment.provePossession(
      enrolled.sign(unsignedSiblingEnrollment.getProofOfPossessionPayload()),
    );
    const siblingEnrollment = provenSiblingEnrollment.authorize(
      owner.sign(provenSiblingEnrollment.getSigningPayload()),
    );
    local.registry.putDocument.mockImplementationOnce(() => {
      local.setHead(remoteHead ?? {});

      return Promise.resolve();
    });

    const applied = await local.repository.compareAndApply(siblingEnrollment);

    expect(applied.getRevision().valueOf()).toBe(2);
    expect(
      applied.isAuthorized(
        DeviceCredential.fromString(revoked.toPrimitives().publicKey),
      ),
    ).toBe(false);
    expect(
      applied.isAuthorized(
        DeviceCredential.fromString(enrolled.toPrimitives().publicKey),
      ),
    ).toBe(false);
  });

  it('rejects replicated documents containing unverified transition history', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const injected = {
      ...trusted,
      history: [
        {
          transition: {
            ...transition.toPrimitives(),
            signature: 'invalid-signature',
          },
        },
      ],
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
  });

  it('rejects replicated transitions containing unsigned fields', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    await repository.compareAndApply(transition);
    const accepted = getHead();
    const injected = {
      ...accepted,
      history: [
        {
          transition: {
            ...transition.toPrimitives(),
            unsigned: 'attacker-controlled',
          },
        },
      ],
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
  });

  it('rejects replicated authorization history above the replay limit', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    await repository.compareAndApply(transition);
    const accepted = getHead();
    const injected = {
      ...accepted,
      history: Array.from({ length: 129 }, () => ({
        transition: transition.toPrimitives(),
      })),
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
  });

  it('accepts authorization history beyond the sibling limit across revisions', async () => {
    const { genesis, identityId, recovery } = await fixture();
    const target = await KeyPair.generate();
    const credential = DeviceCredential.fromString(
      target.toPrimitives().publicKey,
    );
    const { getHead, getMerger, repository } = repositoryFixture();
    const policy = new DeviceAuthorizationPolicy();
    const history: Array<{
      transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
    }> = [];
    let authorization = genesis;
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();

    for (let revision = 0; revision < 129; revision += 1) {
      const unsigned = DeviceAuthorizationTransition.recovery(
        identityId,
        DeviceAuthorizationOperationId.generate(),
        new DeviceAuthorizationRevision(revision),
        credential,
      );
      const proven = unsigned.provePossession(
        target.sign(unsigned.getProofOfPossessionPayload()),
      );
      const transition = proven.authorizeRecovery(
        recovery.sign(proven.getSigningPayload()),
      );

      authorization = policy.apply(authorization, transition);
      history.push({ transition: transition.toPrimitives() });
    }

    const merged = getMerger()?.(trusted, {
      ...(trusted ?? {}),
      authorization: authorization.toPrimitives(),
      history,
    }) as { authorization?: { revision?: number }; history?: unknown[] };

    expect(merged.authorization?.revision).toBe(129);
    expect(merged.history).toHaveLength(129);
  });

  it('compacts accepted history into a signed recovery checkpoint', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const firstTarget = await KeyPair.generate();
    const recovered = await KeyPair.generate();
    const nextTarget = await KeyPair.generate();
    const { getHead, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        firstTarget,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const unsignedRecovery = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(recovered.toPrimitives().publicKey),
    );
    const provenRecovery = unsignedRecovery.provePossession(
      recovered.sign(unsignedRecovery.getProofOfPossessionPayload()),
    );
    await repository.compareAndApply(
      provenRecovery.authorizeRecovery(
        recovery.sign(provenRecovery.getSigningPayload()),
      ),
    );

    expect(getHead()).toMatchObject({
      authorization: { revision: 2 },
      checkpoint: {
        authorization: { revision: 2 },
        transition: {
          transition: { operation: 'recover', revision: 2 },
        },
      },
      history: [],
    });

    const authorization = await repository.compareAndApply(
      await enrollment(
        identityId,
        recovered,
        nextTarget,
        '00000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000003',
        new DeviceAuthorizationRevision(2),
      ),
    );

    expect(authorization.getRevision().valueOf()).toBe(3);
    expect(authorization.getCredentials()).toHaveLength(2);
  });

  it('rejects sequential history above the total replay limit before parsing', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const primitives = transition.toPrimitives();
    const parser = jest.spyOn(DeviceAuthorizationTransition, 'fromPrimitives');
    const injected = {
      ...trusted,
      history: Array.from({ length: 257 }, (_, previousRevision) => ({
        transition: {
          ...primitives,
          previousRevision,
          revision: previousRevision + 1,
        },
      })),
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
    expect(parser).not.toHaveBeenCalled();
    parser.mockRestore();
  });

  it('rejects aggregate history bytes before parsing transitions', async () => {
    const { genesis } = await fixture();
    const { getHead, getMerger, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const parser = jest.spyOn(DeviceAuthorizationTransition, 'fromPrimitives');
    const injected = {
      ...trusted,
      history: Array.from({ length: 70 }, (_, previousRevision) => ({
        transition: {
          padding: 'a'.repeat(15_000),
          previousRevision,
        },
      })),
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
    expect(parser).not.toHaveBeenCalled();
    parser.mockRestore();
  });

  it('rejects oversized authorization history before parsing transitions', async () => {
    const { genesis } = await fixture();
    const { getHead, getMerger, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const parser = jest.spyOn(DeviceAuthorizationTransition, 'fromPrimitives');
    const injected = {
      ...trusted,
      history: [
        {
          transition: {
            signature: 'a'.repeat(1_048_576),
          },
        },
      ],
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
    expect(parser).not.toHaveBeenCalled();
    parser.mockRestore();
  });

  it('does not parse unreachable fabricated revisions', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const primitives = transition.toPrimitives();
    const parser = jest.spyOn(DeviceAuthorizationTransition, 'fromPrimitives');
    const injected = {
      ...trusted,
      history: Array.from({ length: 1_000 }, (_, previousRevision) => ({
        transition: {
          ...primitives,
          previousRevision,
          revision: previousRevision + 1,
        },
      })),
    };

    expect(getMerger()?.(trusted, injected)).toEqual(trusted);
    expect(parser.mock.calls.length).toBeLessThanOrEqual(2);
    parser.mockRestore();
  });

  it('restores the signed identity genesis after an untrusted restart head', async () => {
    const { genesis, identityId } = await fixture();
    const attackerRecovery = await KeyPair.generate();
    const malicious = DeviceAuthorization.genesis(
      identityId,
      genesis.getNetworkIds(),
      DeviceCredential.fromIdentityId(identityId),
      RecoveryAuthority.fromString(attackerRecovery.toPrimitives().publicKey),
    );
    const { identityRepository, repository, setHead } = repositoryFixture();
    const identity = mock<Identity>();
    identity.getNetworkIds.mockReturnValue(genesis.getNetworkIds());
    identity.getInitialDeviceCredential.mockReturnValue(
      genesis.getCredentials()[0],
    );
    identity.getRecoveryAuthority.mockReturnValue(
      genesis.getRecoveryAuthority(),
    );
    identity.getVersion.mockReturnValue(new IdentityVersion(1));
    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([
      new IdentityCandidate(genesisExternalIdentifier, identity),
    ]);
    setHead({
      authorization: malicious.toPrimitives(),
      genesis: malicious.toPrimitives(),
      history: [],
      id: `device-authorization:${identityId.valueOf()}`,
      identityId: identityId.valueOf(),
      kind: 'device_authorization',
    });

    const restored = await repository.find(identityId);

    expect(restored?.toPrimitives()).toEqual(genesis.toPrimitives());
  });

  it('returns a concurrently merged checkpoint when repairing an untrusted head', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, registry, repository, setHead } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(transition);
    const concurrentHead = getHead();
    setHead({ kind: 'untrusted' });
    registry.putHead.mockImplementationOnce(() => {
      setHead(concurrentHead ?? {});

      return Promise.resolve();
    });

    const restored = await repository.find(identityId);

    expect(restored?.getRevision().valueOf()).toBe(1);
    expect(
      restored?.isAuthorized(
        DeviceCredential.fromString(target.toPrimitives().publicKey),
      ),
    ).toBe(true);
  });

  it('preserves authorization history when identity routing networks expand', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, networkRegistry, registry, repository } =
      repositoryFixture();
    networkRegistry.getAll.mockReturnValue([
      ...networkRegistry.getAll(),
      privateNetwork('550e8400-e29b-41d4-a716-446655440001'),
    ]);
    const enrolled = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );
    const expandedGenesis = DeviceAuthorization.genesis(
      identityId,
      [
        ...genesis.getNetworkIds(),
        new NetworkId('550e8400-e29b-41d4-a716-446655440001'),
      ],
      genesis.getCredentials()[0],
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(enrolled);
    const revisionOne = getHead();

    await provisionAuthorization(
      repository,
      expandedGenesis,
      2,
      new IdentityExternalIdentifier('bafy-expanded'),
    );
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(
      revocation.authorize(owner.sign(revocation.getSigningPayload())),
    );
    const revisionTwo = getHead();
    const merged = getMerger()?.(revisionOne, revisionTwo ?? {}) as {
      authorization?: { revision?: number };
    };

    const authorization = await repository.find(identityId);

    expect(merged.authorization?.revision).toBe(2);
    expect(authorization?.getRevision().valueOf()).toBe(2);
    expect(
      authorization?.isAuthorized(
        DeviceCredential.fromString(owner.toPrimitives().publicKey),
      ),
    ).toBe(false);
    expect(
      authorization?.isAuthorized(
        DeviceCredential.fromString(target.toPrimitives().publicKey),
      ),
    ).toBe(true);
    expect(registry.putHead).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      [
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001',
      ],
    );
  });

  it('refreshes cached routing before persisting a device transition', async () => {
    const { genesis, identityId, owner } = await fixture();
    const enrolled = await KeyPair.generate();
    const expandedNetworkId = '550e8400-e29b-41d4-a716-446655440001';
    const { identityRepository, networkRegistry, registry, repository } =
      repositoryFixture();
    networkRegistry.getAll.mockReturnValue([
      ...networkRegistry.getAll(),
      privateNetwork(expandedNetworkId),
    ]);
    await provisionAuthorization(repository, genesis);
    await repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        enrolled,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const identity = mock<Identity>();
    identity.getNetworkIds.mockReturnValue([
      ...genesis.getNetworkIds(),
      new NetworkId(expandedNetworkId),
    ]);
    identity.getInitialDeviceCredential.mockReturnValue(
      genesis.getCredentials()[0],
    );
    identity.getRecoveryAuthority.mockReturnValue(
      genesis.getRecoveryAuthority(),
    );
    identity.getVersion.mockReturnValue(new IdentityVersion(2));
    identityRepository.findFreshCandidateReferencesById.mockResolvedValue([
      new IdentityCandidate(
        new IdentityExternalIdentifier('bafy-expanded'),
        identity,
      ),
    ]);
    const revocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );

    await repository.compareAndApply(
      revocation.authorize(owner.sign(revocation.getSigningPayload())),
    );

    expect(registry.putHead).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        authorization: expect.objectContaining({ revision: 2 }),
      }),
      ['550e8400-e29b-41d4-a716-446655440000', expandedNetworkId],
    );
  });

  it('selects routing for equal-version identity forks by canonical content identifier', async () => {
    const { genesis, identityId } = await fixture();
    const preferredNetworkId = '550e8400-e29b-41d4-a716-446655440002';
    const otherNetworkId = '550e8400-e29b-41d4-a716-446655440001';
    const preferred = DeviceAuthorization.genesis(
      identityId,
      [...genesis.getNetworkIds(), new NetworkId(preferredNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );
    const other = DeviceAuthorization.genesis(
      identityId,
      [...genesis.getNetworkIds(), new NetworkId(otherNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );
    const first = repositoryFixture();
    const second = repositoryFixture();
    for (const current of [first, second]) {
      current.networkRegistry.getAll.mockReturnValue([
        ...current.networkRegistry.getAll(),
        privateNetwork(preferredNetworkId),
        privateNetwork(otherNetworkId),
      ]);
    }

    const preferredIdentifier = new IdentityExternalIdentifier('bafy-a-fork');
    const otherIdentifier = new IdentityExternalIdentifier('bafy-b-fork');

    await provisionAuthorization(
      first.repository,
      preferred,
      2,
      preferredIdentifier,
    );
    await provisionAuthorization(first.repository, other, 2, otherIdentifier);
    await provisionAuthorization(second.repository, other, 2, otherIdentifier);
    await provisionAuthorization(
      second.repository,
      preferred,
      2,
      preferredIdentifier,
    );

    const expectedNetworks = [
      '550e8400-e29b-41d4-a716-446655440000',
      preferredNetworkId,
    ];
    expect(first.registry.putHead).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expectedNetworks,
    );
    expect(second.registry.putHead).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expectedNetworks,
    );
  });
});
