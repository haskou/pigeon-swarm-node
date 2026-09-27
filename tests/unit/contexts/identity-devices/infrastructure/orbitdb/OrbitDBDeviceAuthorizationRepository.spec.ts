import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import OrbitDBDeviceAuthorizationRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRepository';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { OrbitDBHeadRecordMerger } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadRecordMerger';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

describe(OrbitDBDeviceAuthorizationRepository.name, () => {
  const now = new Timestamp(1_800_000_000_000);

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
    let head: Record<string, unknown> | undefined;
    let merger: OrbitDBHeadRecordMerger | undefined;

    registry.registerHeadRecordMerger.mockImplementation((_prefix, value) => {
      merger = value;
    });
    registry.findHead.mockImplementation(() => Promise.resolve(head));
    registry.putDocument.mockResolvedValue();
    registry.putHead.mockImplementation((_key, value) => {
      head = value;

      return Promise.resolve();
    });

    return {
      getHead: () => head,
      getMerger: () => merger,
      identityRepository,
      registry,
      repository: new OrbitDBDeviceAuthorizationRepository(
        registry,
        new DeviceAuthorizationPolicy(),
        identityRepository,
      ),
      setHead: (value: Record<string, unknown>): void => {
        head = value;
      },
    };
  }

  async function enrollment(
    identityId: IdentityId,
    owner: KeyPair,
    target: KeyPair,
    operationId: string,
    pairingId: string,
  ): Promise<DeviceAuthorizationTransition> {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      DeviceAuthorizationRevision.initial(),
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
    const { repository } = repositoryFixture();
    const transition = await enrollment(
      identityId,
      owner,
      target,
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    );
    await repository.provision(genesis);

    const applied = await repository.compareAndApply(transition);

    expect(applied.getRevision().valueOf()).toBe(1);
    await expect(repository.compareAndApply(transition)).rejects.toThrow();
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
    await repository.provision(genesis);

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
    await repository.provision(genesis);

    const merged = getMerger()?.(getHead(), {
      authorization: authorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [{ transition: transition.toPrimitives() }],
      id: identityId.valueOf(),
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
    await repository.provision(genesis);
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
    await first.repository.provision(genesis);
    await second.repository.provision(genesis);
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
        ]),
        revision: 1,
      },
    });
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
    await first.repository.provision(genesis);
    await first.repository.compareAndApply(enrolled);
    second.setHead(first.getHead() ?? {});
    await second.repository.provision(genesis);
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
    await first.repository.provision(genesis);
    await first.repository.compareAndApply(initialEnrollment);
    second.setHead(first.getHead() ?? {});
    await second.repository.provision(genesis);
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
      provenEnrollment.authorize(owner.sign(provenEnrollment.getSigningPayload())),
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
    await repository.provision(genesis);
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
    identityRepository.findById.mockResolvedValue(identity);
    setHead({
      authorization: malicious.toPrimitives(),
      genesis: malicious.toPrimitives(),
      history: [],
      id: identityId.valueOf(),
      kind: 'device_authorization',
    });

    const restored = await repository.find(identityId);

    expect(restored?.toPrimitives()).toEqual(genesis.toPrimitives());
  });

  it('preserves authorization history when identity routing networks expand', async () => {
    const { genesis, identityId, owner, recovery } = await fixture();
    const target = await KeyPair.generate();
    const { getHead, getMerger, registry, repository } = repositoryFixture();
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
    await repository.provision(genesis);
    await repository.compareAndApply(enrolled);
    const revisionOne = getHead();

    await repository.provision(expandedGenesis);
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
});
