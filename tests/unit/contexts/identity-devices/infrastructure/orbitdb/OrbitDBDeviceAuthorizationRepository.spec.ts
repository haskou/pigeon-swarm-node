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
import { DeviceAuthorizationEpoch } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationEpoch';
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
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
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
    const stored = new Map<string, Record<string, unknown>>();
    const database = mock<EmbeddedLocalDatabase>();
    database.save.mockImplementation((_namespace, id, document) => {
      stored.set(id, { ...document, _id: id });

      return Promise.resolve();
    });
    database.findOne.mockImplementation((_namespace, id) =>
      Promise.resolve(stored.get(id)),
    );

    return {
      database,
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
        database,
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
    epoch = DeviceAuthorizationEpoch.genesis(),
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
      epoch,
    );

    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(owner.sign(proven.getSigningPayload()));
  }

  function revocation(
    identityId: IdentityId,
    author: KeyPair,
    target: KeyPair,
    operationId: string,
    previousRevision: DeviceAuthorizationRevision,
    epoch = DeviceAuthorizationEpoch.genesis(),
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      previousRevision,
      DeviceCredential.fromString(author.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      epoch,
    );

    return unsigned.authorize(author.sign(unsigned.getSigningPayload()));
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

  it('keeps authorization local and usable when the identity only uses public networks', async () => {
    const { genesis, identityId, owner } = await fixture();
    const target = await KeyPair.generate();
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
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );

    await provisionAuthorization(repository, authorization);
    const applied = await repository.compareAndApply(transition);
    const found = await repository.find(identityId);

    expect(applied.getRevision().valueOf()).toBe(1);
    expect(found?.getRevision().valueOf()).toBe(1);
    expect(found?.getCredentials()).toHaveLength(2);
    await expect(repository.compareAndApply(transition)).rejects.toThrow();
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

  it('converges at the sibling limit and drops stale branches after recovery', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const first = repositoryFixture();
    const second = repositoryFixture();
    const third = repositoryFixture();
    const targets = await Promise.all(
      Array.from({ length: 133 }, () => KeyPair.generate()),
    );
    const transitions = await Promise.all(
      targets
        .slice(0, 128)
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
    const firstTransitions = transitions.slice(0, 64);
    const secondTransitions = transitions.slice(64);
    const firstDescendant = await enrollment(
      identityId,
      owner,
      targets[128],
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      new DeviceAuthorizationRevision(1),
    );
    const secondDescendant = await enrollment(
      identityId,
      owner,
      targets[129],
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      new DeviceAuthorizationRevision(1),
    );
    const alternateFirstDescendant = await enrollment(
      identityId,
      owner,
      targets[130],
      '20000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000003',
      new DeviceAuthorizationRevision(1),
    );
    const alternateSecondDescendant = await enrollment(
      identityId,
      owner,
      targets[131],
      '20000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000004',
      new DeviceAuthorizationRevision(1),
    );
    const excessSibling = await enrollment(
      identityId,
      owner,
      targets[132],
      '20000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000005',
    );
    const policy = new DeviceAuthorizationPolicy();
    const firstAuthorization = genesis.enrollConcurrently(
      firstTransitions.map((transition) => transition.getTargetCredential()),
    );
    const secondAuthorization = genesis.enrollConcurrently(
      secondTransitions.map((transition) => transition.getTargetCredential()),
    );
    const firstHeadAuthorization = policy.apply(
      firstAuthorization,
      firstDescendant,
    );
    const secondHeadAuthorization = policy.apply(
      secondAuthorization,
      secondDescendant,
    );
    const alternateFirstAuthorization = policy.apply(
      firstAuthorization,
      alternateFirstDescendant,
    );
    const alternateSecondAuthorization = policy.apply(
      secondAuthorization,
      alternateSecondDescendant,
    );

    await provisionAuthorization(first.repository, genesis);
    await provisionAuthorization(second.repository, genesis);
    await provisionAuthorization(third.repository, genesis);
    await third.repository.compareAndApply(excessSibling);
    first.setHead({
      authorization: firstHeadAuthorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: firstTransitions
        .map((transition) => ({
          transition: transition.toPrimitives(),
        }))
        .concat([{ transition: firstDescendant.toPrimitives() }]),
      id: `device-authorization:${identityId.valueOf()}`,
      identityId: identityId.valueOf(),
      kind: 'device_authorization',
    });
    second.setHead({
      authorization: secondHeadAuthorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [
        ...secondTransitions.map((transition) => ({
          transition: transition.toPrimitives(),
        })),
        { transition: secondDescendant.toPrimitives() },
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
    expect(
      (mergedFromFirst as { authorization?: { credentials?: string[] } })
        .authorization?.credentials,
    ).toHaveLength(128);
    expect(
      (mergedFromFirst as { authorization?: { revision?: number } })
        .authorization?.revision,
    ).toBe(1);
    const overflow = first.getMerger()?.(
      mergedFromFirst,
      third.getHead() ?? {},
    ) as { authorization?: { credentials?: string[] }; overflow?: unknown };
    const reversedOverflow = first.getMerger()?.(
      third.getHead(),
      mergedFromFirst ?? {},
    );

    expect(overflow).toEqual(reversedOverflow);
    expect(overflow.authorization?.credentials).toEqual([]);
    expect(overflow.overflow).toBeDefined();

    const alternateFirst = {
      ...(first.getHead() ?? {}),
      authorization: alternateFirstAuthorization.toPrimitives(),
      history: firstTransitions
        .map((transition) => ({ transition: transition.toPrimitives() }))
        .concat([{ transition: alternateFirstDescendant.toPrimitives() }]),
    };
    const alternateSecond = {
      ...(second.getHead() ?? {}),
      authorization: alternateSecondAuthorization.toPrimitives(),
      history: secondTransitions
        .map((transition) => ({ transition: transition.toPrimitives() }))
        .concat([{ transition: alternateSecondDescendant.toPrimitives() }]),
    };
    const alternateMerged = first.getMerger()?.(
      alternateFirst,
      alternateSecond,
    );
    const recovered = repositoryFixture();
    const recoveryTarget = await KeyPair.generate();
    await provisionAuthorization(recovered.repository, genesis);
    await recovered.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        recoveryTarget,
        '40000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
      ),
    );
    await recovered.repository.compareAndApply(
      revocation(
        identityId,
        owner,
        recoveryTarget,
        '60000000-0000-4000-8000-000000000001',
        new DeviceAuthorizationRevision(1),
      ),
    );
    const unsignedRecovery = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '70000000-0000-4000-8000-000000000001',
      ),
      new DeviceAuthorizationRevision(2),
      DeviceCredential.fromString(recoveryTarget.toPrimitives().publicKey),
    );
    const provenRecovery = unsignedRecovery.provePossession(
      recoveryTarget.sign(unsignedRecovery.getProofOfPossessionPayload()),
    );
    await recovered.repository.compareAndApply(
      provenRecovery.authorizeRecovery(
        recovery.sign(provenRecovery.getSigningPayload()),
      ),
    );
    const recoveryHead = recovered.getHead();
    const onceMerged = first.getMerger()?.(recoveryHead, mergedFromFirst ?? {});
    const staleFlood = first.getMerger()?.(onceMerged, alternateMerged ?? {});
    const staleOverflow = first.getMerger()?.(
      mergedFromFirst,
      alternateMerged ?? {},
    );
    const recoveredAfterOverflow = first.getMerger()?.(
      staleOverflow,
      recoveryHead ?? {},
    );

    expect(onceMerged).toEqual(recoveryHead);
    expect(staleFlood).toEqual(recoveryHead);
    expect((staleOverflow as { overflow?: unknown }).overflow).toBeDefined();
    expect(recoveredAfterOverflow).toEqual(recoveryHead);
  }, 60_000);

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

  it('preserves an honest revocation when merged history exceeds the record limit', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const ownerCredential = owner.toPrimitives().publicKey;
    let defender = await KeyPair.generate();

    while (defender.toPrimitives().publicKey < ownerCredential) {
      defender = await KeyPair.generate();
    }

    const transient = await KeyPair.generate();
    const aggregate = repositoryFixture();
    const policy = new DeviceAuthorizationPolicy();
    await provisionAuthorization(aggregate.repository, genesis);
    await aggregate.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        defender,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const base = aggregate.getHead() as {
      authorization: ReturnType<DeviceAuthorization['toPrimitives']>;
      history: Array<{
        transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
      }>;
    };
    const honestTransition = revocation(
      identityId,
      defender,
      owner,
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      new DeviceAuthorizationRevision(1),
    );
    const honest = {
      ...base,
      authorization: policy
        .apply(
          DeviceAuthorization.fromPrimitives(base.authorization),
          honestTransition,
        )
        .toPrimitives(),
      history: [
        ...base.history,
        { transition: honestTransition.toPrimitives() },
      ],
      sources: [
        {
          history: [
            ...base.history,
            { transition: honestTransition.toPrimitives() },
          ],
        },
      ],
    };
    let maliciousAuthorization = DeviceAuthorization.fromPrimitives(
      base.authorization,
    );
    const maliciousHistory = [...base.history];

    for (let index = 0; index < 127; index += 1) {
      const enrollmentRevision = maliciousAuthorization.getRevision();
      const suffix = String(index + 2).padStart(12, '0');
      const enroll = await enrollment(
        identityId,
        owner,
        transient,
        `00000000-0000-4000-8000-${suffix}`,
        `10000000-0000-4000-8000-${suffix}`,
        enrollmentRevision,
      );
      maliciousAuthorization = policy.apply(maliciousAuthorization, enroll);
      maliciousHistory.push({ transition: enroll.toPrimitives() });
      const revoke = revocation(
        identityId,
        owner,
        transient,
        `20000000-0000-4000-8000-${suffix}`,
        maliciousAuthorization.getRevision(),
      );
      maliciousAuthorization = policy.apply(maliciousAuthorization, revoke);
      maliciousHistory.push({ transition: revoke.toPrimitives() });
    }

    const boundaryAuthorization = maliciousAuthorization;
    const boundaryHistory = [...maliciousHistory];
    const revokeOwnerAtBoundary = revocation(
      identityId,
      defender,
      owner,
      '40000000-0000-4000-8000-999999999999',
      boundaryAuthorization.getRevision(),
    );
    const revokeDefender = revocation(
      identityId,
      owner,
      defender,
      '30000000-0000-4000-8000-999999999999',
      maliciousAuthorization.getRevision(),
    );
    maliciousAuthorization = policy.apply(
      maliciousAuthorization,
      revokeDefender,
    );
    maliciousHistory.push({ transition: revokeDefender.toPrimitives() });
    const malicious = {
      ...base,
      authorization: maliciousAuthorization.toPrimitives(),
      history: maliciousHistory,
      sources: [{ history: maliciousHistory }],
    };
    const competingRevocation = {
      ...base,
      authorization: policy
        .apply(boundaryAuthorization, revokeOwnerAtBoundary)
        .toPrimitives(),
      history: [
        ...boundaryHistory,
        { transition: revokeOwnerAtBoundary.toPrimitives() },
      ],
      sources: [
        {
          history: [
            ...boundaryHistory,
            { transition: revokeOwnerAtBoundary.toPrimitives() },
          ],
        },
      ],
    };
    const overflow = aggregate.getMerger()?.(
      competingRevocation,
      malicious,
    ) as {
      authorization?: { credentials?: string[] };
      overflow?: unknown;
    };
    const reversedOverflow = aggregate.getMerger()?.(
      malicious,
      competingRevocation,
    );
    const repeatedOverflow = aggregate.getMerger()?.(overflow, overflow);
    const merged = aggregate.getMerger()?.(honest, malicious) as {
      authorization?: { credentials?: string[] };
      history?: Array<{
        transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
      }>;
      overflow?: unknown;
    };
    const reversed = aggregate.getMerger()?.(malicious, honest);
    const leftAssociated = aggregate.getMerger()?.(merged, competingRevocation);
    const rightAssociated = aggregate.getMerger()?.(overflow, honest);

    expect(overflow).toEqual(reversedOverflow);
    expect(repeatedOverflow).toEqual(overflow);
    expect(leftAssociated).toEqual(rightAssociated);
    expect(overflow.authorization?.credentials).toEqual([]);
    expect(overflow.overflow).toBeDefined();
    const overflowDocument = overflow as Record<string, unknown> & {
      overflow: Record<string, unknown>;
    };
    const forgedFrontier = {
      ...overflowDocument,
      overflow: { ...overflowDocument.overflow, frontier: base },
    };

    expect(
      aggregate.getMerger()?.(base as Record<string, unknown>, forgedFrontier),
    ).toEqual(base);
    expect(Buffer.byteLength(JSON.stringify(overflow), 'utf8')).toBeLessThan(
      6_000_000,
    );
    const recovered = await KeyPair.generate();
    const overflowRevision = new DeviceAuthorizationRevision(
      (overflow as { authorization: { revision: number } }).authorization
        .revision,
    );
    const unsignedRecovery = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '50000000-0000-4000-8000-999999999999',
      ),
      overflowRevision,
      DeviceCredential.fromString(recovered.toPrimitives().publicKey),
    );
    const provenRecovery = unsignedRecovery.provePossession(
      recovered.sign(unsignedRecovery.getProofOfPossessionPayload()),
    );
    aggregate.setHead(overflow as Record<string, unknown>);
    const blockedEnrollment = await enrollment(
      identityId,
      owner,
      await KeyPair.generate(),
      '60000000-0000-4000-8000-999999999999',
      '70000000-0000-4000-8000-999999999999',
      overflowRevision,
    );

    await expect(
      aggregate.repository.compareAndApply(blockedEnrollment),
    ).rejects.toThrow();

    await expect(
      aggregate.repository.compareAndApply(
        provenRecovery.authorizeRecovery(
          recovery.sign(provenRecovery.getSigningPayload()),
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        getCredentials: expect.any(Function),
      }),
    );
    expect(
      (aggregate.getHead() as { overflow?: unknown }).overflow,
    ).toBeUndefined();
    expect(
      (aggregate.getHead() as { authorization: { credentials: string[] } })
        .authorization.credentials,
    ).toEqual([recovered.toPrimitives().publicKey]);
    expect(merged).toEqual(reversed);
    expect(merged.authorization?.credentials).toEqual([]);
    expect(merged.authorization?.credentials).not.toContain(ownerCredential);
    expect(merged.history).toEqual([]);
    expect(merged.overflow).toBeDefined();
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

  it('discards branches that did not observe the recovery checkpoint', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const defender = await KeyPair.generate();
    const recovered = await KeyPair.generate();
    const descendant = await KeyPair.generate();
    const common = repositoryFixture();
    await provisionAuthorization(common.repository, genesis);
    await common.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        defender,
        '01000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
      ),
    );
    const commonHead = common.getHead() ?? {};
    const enrollmentBranch = repositoryFixture();
    await provisionAuthorization(enrollmentBranch.repository, genesis);
    enrollmentBranch.setHead(commonHead);
    await enrollmentBranch.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        recovered,
        '01000000-0000-4000-8000-000000000002',
        '11000000-0000-4000-8000-000000000002',
        new DeviceAuthorizationRevision(1),
      ),
    );
    await enrollmentBranch.repository.compareAndApply(
      await enrollment(
        identityId,
        recovered,
        descendant,
        '01000000-0000-4000-8000-000000000003',
        '11000000-0000-4000-8000-000000000003',
        new DeviceAuthorizationRevision(2),
      ),
    );
    const revocationBranch = repositoryFixture();
    await provisionAuthorization(revocationBranch.repository, genesis);
    revocationBranch.setHead(commonHead);
    await revocationBranch.repository.compareAndApply(
      revocation(
        identityId,
        defender,
        owner,
        '21000000-0000-4000-8000-000000000001',
        new DeviceAuthorizationRevision(1),
      ),
    );
    const recoveryBranch = repositoryFixture();
    await provisionAuthorization(recoveryBranch.repository, genesis);
    recoveryBranch.setHead(commonHead);
    const unsignedRecovery = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '31000000-0000-4000-8000-000000000001',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(recovered.toPrimitives().publicKey),
    );
    const provenRecovery = unsignedRecovery.provePossession(
      recovered.sign(unsignedRecovery.getProofOfPossessionPayload()),
    );
    await recoveryBranch.repository.compareAndApply(
      provenRecovery.authorizeRecovery(
        recovery.sign(provenRecovery.getSigningPayload()),
      ),
    );
    const merge = common.getMerger();
    const enrollmentHead = enrollmentBranch.getHead() ?? {};
    const revocationHead = revocationBranch.getHead() ?? {};
    const recoveryHead = recoveryBranch.getHead() ?? {};
    const left = merge?.(merge?.(enrollmentHead, revocationHead), recoveryHead);
    const right = merge?.(
      enrollmentHead,
      merge?.(revocationHead, recoveryHead) ?? {},
    );

    expect(left).toEqual(right);
    expect(
      (left as { authorization?: { credentials?: string[] } }).authorization
        ?.credentials,
    ).toEqual([recovered.toPrimitives().publicKey]);
  });

  it('preserves every distinct revocation when equivalent siblings exceed the bound', async () => {
    const { genesis, identityId, owner } = await fixture();
    const attacker = await KeyPair.generate();
    const survivor = await KeyPair.generate();
    const aggregate = repositoryFixture();
    await provisionAuthorization(aggregate.repository, genesis);
    await aggregate.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        attacker,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    await aggregate.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        survivor,
        '00000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        new DeviceAuthorizationRevision(1),
      ),
    );
    const base = aggregate.getHead();

    expect(base).toBeDefined();
    let malicious = base as Record<string, unknown>;

    for (let index = 0; index < 128; index += 1) {
      const branch = repositoryFixture();
      const target = index % 2 === 0 ? owner : survivor;
      const unsigned = DeviceAuthorizationTransition.revocation(
        identityId,
        new DeviceAuthorizationOperationId(
          `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        ),
        new DeviceAuthorizationRevision(2),
        DeviceCredential.fromString(attacker.toPrimitives().publicKey),
        DeviceCredential.fromString(target.toPrimitives().publicKey),
      );
      await provisionAuthorization(branch.repository, genesis);
      branch.setHead(base as Record<string, unknown>);
      await branch.repository.compareAndApply(
        unsigned.authorize(attacker.sign(unsigned.getSigningPayload())),
      );
      malicious = aggregate.getMerger()?.(
        malicious,
        branch.getHead() ?? {},
      ) as Record<string, unknown>;
    }

    expect((malicious as { overflow?: unknown }).overflow).toBeDefined();

    const honest = repositoryFixture();
    const unsignedHonest = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-999999999999',
      ),
      new DeviceAuthorizationRevision(2),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(attacker.toPrimitives().publicKey),
    );
    await provisionAuthorization(honest.repository, genesis);
    honest.setHead(base as Record<string, unknown>);
    await honest.repository.compareAndApply(
      unsignedHonest.authorize(owner.sign(unsignedHonest.getSigningPayload())),
    );

    const merged = aggregate.getMerger()?.(
      malicious,
      honest.getHead() ?? {},
    ) as {
      authorization?: { credentials?: string[] };
      history?: Array<{ transition: { previousRevision: number } }>;
      overflow?: unknown;
    };

    expect(merged.authorization?.credentials).toEqual([]);
    expect(merged.history).toEqual([]);
    expect(merged.overflow).toBeDefined();
  });

  it('retains a valid equivalent revocation when another branch invalidates its author', async () => {
    const { genesis, identityId, owner } = await fixture();
    const compromised = await KeyPair.generate();
    const equivalentAuthors = await Promise.all([
      KeyPair.generate(),
      KeyPair.generate(),
    ]);
    equivalentAuthors.sort((left, right) =>
      left
        .toPrimitives()
        .publicKey.localeCompare(right.toPrimitives().publicKey),
    );
    const [invalidAuthor, validAuthor] = equivalentAuthors;
    const target = await KeyPair.generate();
    const baseRepository = repositoryFixture();
    await provisionAuthorization(baseRepository.repository, genesis);
    await baseRepository.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        compromised,
        '00000000-0000-4000-8000-000000000010',
        '10000000-0000-4000-8000-000000000010',
      ),
    );
    await baseRepository.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        validAuthor,
        '00000000-0000-4000-8000-000000000011',
        '10000000-0000-4000-8000-000000000011',
        new DeviceAuthorizationRevision(1),
      ),
    );
    await baseRepository.repository.compareAndApply(
      await enrollment(
        identityId,
        owner,
        target,
        '00000000-0000-4000-8000-000000000012',
        '10000000-0000-4000-8000-000000000012',
        new DeviceAuthorizationRevision(2),
      ),
    );
    const base = baseRepository.getHead() as Record<string, unknown>;
    const attacker = repositoryFixture();
    await provisionAuthorization(attacker.repository, genesis);
    attacker.setHead(base);
    await attacker.repository.compareAndApply(
      await enrollment(
        identityId,
        compromised,
        invalidAuthor,
        '00000000-0000-4000-8000-000000000013',
        '10000000-0000-4000-8000-000000000013',
        new DeviceAuthorizationRevision(3),
      ),
    );
    const invalidRevocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000014',
      ),
      new DeviceAuthorizationRevision(4),
      DeviceCredential.fromString(invalidAuthor.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
    );
    await attacker.repository.compareAndApply(
      invalidRevocation.authorize(
        invalidAuthor.sign(invalidRevocation.getSigningPayload()),
      ),
    );

    const honest = repositoryFixture();
    await provisionAuthorization(honest.repository, genesis);
    honest.setHead(base);
    const revokeCompromised = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000015',
      ),
      new DeviceAuthorizationRevision(3),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(compromised.toPrimitives().publicKey),
    );
    await honest.repository.compareAndApply(
      revokeCompromised.authorize(
        owner.sign(revokeCompromised.getSigningPayload()),
      ),
    );
    const validRevocation = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000016',
      ),
      new DeviceAuthorizationRevision(4),
      DeviceCredential.fromString(validAuthor.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
    );
    await honest.repository.compareAndApply(
      validRevocation.authorize(
        validAuthor.sign(validRevocation.getSigningPayload()),
      ),
    );

    const merged = baseRepository.getMerger()?.(
      attacker.getHead(),
      honest.getHead() ?? {},
    ) as { authorization?: { credentials?: string[] } };

    expect(merged.authorization?.credentials).not.toContain(
      target.toPrimitives().publicKey,
    );
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
        authorization.getEpoch(),
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
      sources: [{ history }],
    }) as { authorization?: { revision?: number }; history?: unknown[] };

    expect(merged.authorization?.revision).toBe(129);
    expect(merged.history).toHaveLength(129);
  });

  it('compacts sequential source prefixes without forcing recovery', async () => {
    const { genesis, identityId, owner } = await fixture();
    const transient = await KeyPair.generate();
    const { getHead, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);

    for (let index = 0; index < 12; index += 1) {
      const suffix = String(index + 1).padStart(12, '0');
      const current = await repository.find(identityId);

      expect(current).toBeDefined();
      await repository.compareAndApply(
        await enrollment(
          identityId,
          owner,
          transient,
          `41000000-0000-4000-8000-${suffix}`,
          `51000000-0000-4000-8000-${suffix}`,
          current?.getRevision(),
        ),
      );
      const enrolled = await repository.find(identityId);

      expect(enrolled).toBeDefined();
      await repository.compareAndApply(
        revocation(
          identityId,
          owner,
          transient,
          `61000000-0000-4000-8000-${suffix}`,
          enrolled?.getRevision() ?? DeviceAuthorizationRevision.initial(),
        ),
      );
    }

    const head = getHead() as {
      history?: unknown[];
      overflow?: unknown;
      sources?: unknown[];
    };

    expect(head.overflow).toBeUndefined();
    expect(head.history).toHaveLength(24);
    expect(head.sources).toHaveLength(1);
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
        DeviceAuthorizationEpoch.fromRecovery(
          unsignedRecovery.getOperationId(),
        ),
      ),
    );

    expect(authorization.getRevision().valueOf()).toBe(3);
    expect(authorization.getCredentials()).toHaveLength(2);
  });

  it('rejects a replicated recovery checkpoint signed for an earlier epoch', async () => {
    const { genesis, identityId, recovery } = await fixture();
    const firstTarget = await KeyPair.generate();
    const staleTarget = await KeyPair.generate();
    const { getHead, getMerger, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);
    const firstUnsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000001',
      ),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(firstTarget.toPrimitives().publicKey),
    );
    const firstProven = firstUnsigned.provePossession(
      firstTarget.sign(firstUnsigned.getProofOfPossessionPayload()),
    );
    await repository.compareAndApply(
      firstProven.authorizeRecovery(
        recovery.sign(firstProven.getSigningPayload()),
      ),
    );
    const trusted = getHead() as {
      checkpoint: {
        lineage: Array<{
          transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
        }>;
        transition: {
          transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
        };
      };
    } & Record<string, unknown>;
    const staleUnsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(
        '00000000-0000-4000-8000-000000000002',
      ),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(staleTarget.toPrimitives().publicKey),
    );
    const staleProven = staleUnsigned.provePossession(
      staleTarget.sign(staleUnsigned.getProofOfPossessionPayload()),
    );
    const stale = staleProven.authorizeRecovery(
      recovery.sign(staleProven.getSigningPayload()),
    );
    const staleAuthorization = genesis.recoverAt(
      stale.getRevision(),
      stale.getTargetCredential(),
      DeviceAuthorizationEpoch.fromRecovery(stale.getOperationId()),
    );
    const checkpoint = {
      authorization: staleAuthorization.toPrimitives(),
      lineage: [trusted.checkpoint.transition],
      transition: { transition: stale.toPrimitives() },
    };
    const emptyHistory: Array<{
      transition: ReturnType<DeviceAuthorizationTransition['toPrimitives']>;
    }> = [];
    const candidate = {
      ...trusted,
      authorization: staleAuthorization.toPrimitives(),
      checkpoint,
      history: emptyHistory,
      sources: [{ checkpoint, history: emptyHistory }],
    };

    expect(getMerger()?.(trusted, candidate)).toEqual(trusted);
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

  it('rejects unbounded source arrays before canonicalizing the document', async () => {
    const { genesis } = await fixture();
    const { getHead, getMerger, repository } = repositoryFixture();
    await provisionAuthorization(repository, genesis);
    const trusted = getHead();
    const parser = jest.spyOn(DeviceAuthorizationTransition, 'fromPrimitives');
    const injected = {
      ...trusted,
      sources: Array.from({ length: 1_025 }, () => ({
        history: new Array<unknown>(),
      })),
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

  it('discards the routing of a provisional identity candidate that failed to publish', async () => {
    const { genesis, identityId } = await fixture();
    const failedNetworkId = '550e8400-e29b-41d4-a716-446655440002';
    const publishedNetworkId = '550e8400-e29b-41d4-a716-446655440001';
    const failed = DeviceAuthorization.genesis(
      identityId,
      [...genesis.getNetworkIds(), new NetworkId(failedNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );
    const published = DeviceAuthorization.genesis(
      identityId,
      [...genesis.getNetworkIds(), new NetworkId(publishedNetworkId)],
      genesis.getCredentials()[0],
      genesis.getRecoveryAuthority(),
    );
    const current = repositoryFixture();
    current.networkRegistry.getAll.mockReturnValue([
      ...current.networkRegistry.getAll(),
      privateNetwork(failedNetworkId),
      privateNetwork(publishedNetworkId),
    ]);
    const failedIdentifier = new IdentityExternalIdentifier('bafy-a-failed');
    const publishedIdentifier = new IdentityExternalIdentifier(
      'bafy-b-published',
    );

    await provisionAuthorization(
      current.repository,
      failed,
      2,
      failedIdentifier,
    );
    await current.repository.withdrawProvision(
      identityId,
      new IdentityVersion(2),
      failedIdentifier,
    );
    await provisionAuthorization(
      current.repository,
      published,
      2,
      publishedIdentifier,
    );

    expect(current.registry.putHead).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      ['550e8400-e29b-41d4-a716-446655440000', publishedNetworkId],
    );
  });
});
