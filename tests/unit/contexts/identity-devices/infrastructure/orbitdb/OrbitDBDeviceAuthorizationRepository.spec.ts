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

    return { genesis, identityId, owner };
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

    return unsigned.authorize(
      owner.sign(unsigned.getSigningPayload()),
      target.sign(unsigned.getProofOfPossessionPayload()),
    );
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
});
