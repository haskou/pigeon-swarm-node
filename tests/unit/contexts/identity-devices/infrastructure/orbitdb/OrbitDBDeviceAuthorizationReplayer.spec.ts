import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
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
import { OrbitDBDeviceAuthorizationDocument } from '@app/contexts/identity-devices/infrastructure/orbitdb/documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationTransitionRecord } from '@app/contexts/identity-devices/infrastructure/orbitdb/documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationReplayer from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationSources from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationSources';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

describe(OrbitDBDeviceAuthorizationReplayer.name, () => {
  afterEach(() => jest.restoreAllMocks());

  const now = new Timestamp(1_800_000_000_000);
  const canonicalizer = new OrbitDBDeviceAuthorizationCanonicalizer();
  const policy = new DeviceAuthorizationPolicy();
  const replayer = new OrbitDBDeviceAuthorizationReplayer(
    policy,
    canonicalizer,
    new OrbitDBDeviceAuthorizationSources(policy, canonicalizer),
  );

  async function fixture(): Promise<{
    genesis: DeviceAuthorization;
    identityId: IdentityId;
    owner: KeyPair;
    recovery: KeyPair;
  }> {
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
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      previousRevision,
      DeviceCredential.fromString(author.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      DeviceAuthorizationEpoch.genesis(),
    );

    return unsigned.authorize(author.sign(unsigned.getSigningPayload()));
  }

  function recovery(
    identityId: IdentityId,
    recoveryKey: KeyPair,
    target: KeyPair,
    operationId: string,
    previousRevision: DeviceAuthorizationRevision,
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      previousRevision,
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      DeviceAuthorizationEpoch.genesis(),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorizeRecovery(
      recoveryKey.sign(proven.getSigningPayload()),
    );
  }

  function record(
    transition: DeviceAuthorizationTransition,
  ): OrbitDBDeviceAuthorizationTransitionRecord {
    return { transition: transition.toPrimitives() };
  }

  it('excludes a malformed history record and logs only the rejected count', async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);

    const { genesis, identityId, owner } = await fixture();
    const device = await KeyPair.generate();
    const enrolled = record(
      enrollment(
        identityId,
        owner,
        device,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const malformed = {
      transition: { ...enrolled.transition, malformed: true },
    } as unknown as OrbitDBDeviceAuthorizationTransitionRecord;

    const replay = replayer.rebuild(genesis, [enrolled, malformed]);

    expect(replay.history).toEqual([enrolled]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'OrbitDB device authorization replay rejected records: count=1',
    );
  });

  it('lets a recovery at the base revision take precedence over concurrent enrollments', async () => {
    const {
      genesis,
      identityId,
      owner,
      recovery: recoveryKey,
    } = await fixture();
    const device = await KeyPair.generate();
    const recovered = await KeyPair.generate();
    const enrolled = record(
      enrollment(
        identityId,
        owner,
        device,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const recovering = record(
      recovery(
        identityId,
        recoveryKey,
        recovered,
        '00000000-0000-4000-8000-000000000002',
        DeviceAuthorizationRevision.initial(),
      ),
    );

    const forward = replayer.rebuild(genesis, [enrolled, recovering]);
    const reversed = replayer.rebuild(genesis, [recovering, enrolled]);

    expect(forward.authorization.toPrimitives()).toEqual(
      reversed.authorization.toPrimitives(),
    );
    expect(forward.history).toEqual(reversed.history);
    expect(
      forward.authorization
        .getCredentials()
        .map((credential) => credential.valueOf()),
    ).toContain(recovered.toPrimitives().publicKey);
    expect(
      forward.authorization
        .getCredentials()
        .map((credential) => credential.valueOf()),
    ).not.toContain(device.toPrimitives().publicKey);
  });

  it('keeps the least canonical record among equivalent concurrent revocations', async () => {
    const { genesis, identityId, owner } = await fixture();
    const device = await KeyPair.generate();
    const base = [
      record(
        enrollment(
          identityId,
          owner,
          device,
          '00000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
        ),
      ),
    ];
    const revisionOne = new DeviceAuthorizationRevision(1);
    const first = record(
      revocation(
        identityId,
        owner,
        device,
        '00000000-0000-4000-8000-000000000011',
        revisionOne,
      ),
    );
    const second = record(
      revocation(
        identityId,
        owner,
        device,
        '00000000-0000-4000-8000-000000000012',
        revisionOne,
      ),
    );
    const expected = [first, second]
      .map((entry) => canonicalizer.serialize(entry))
      .sort()[0];

    const forward = replayer.rebuild(genesis, [...base, first, second]);
    const reversed = replayer.rebuild(genesis, [...base, second, first]);

    expect(forward.history.length).toBe(2);
    expect(reversed.history.length).toBe(2);
    expect(forward.history.at(-1)).toEqual(reversed.history.at(-1));
    expect(canonicalizer.serialize(forward.history.at(-1))).toBe(expected);
    expect(forward.authorization.toPrimitives()).toEqual(
      reversed.authorization.toPrimitives(),
    );
  });

  it('drops an inapplicable concurrent revocation without changing the authorization', async () => {
    const { genesis, identityId, owner } = await fixture();
    const device = await KeyPair.generate();
    const attacker = await KeyPair.generate();
    const enrolled = record(
      enrollment(
        identityId,
        owner,
        device,
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
      ),
    );
    const forged = record(
      revocation(
        identityId,
        attacker,
        device,
        '00000000-0000-4000-8000-000000000021',
        new DeviceAuthorizationRevision(1),
      ),
    );

    const withForged = replayer.rebuild(genesis, [enrolled, forged]);
    const withoutForged = replayer.rebuild(genesis, [enrolled]);

    expect(withForged.authorization.toPrimitives()).toEqual(
      withoutForged.authorization.toPrimitives(),
    );
    expect(withForged.history).toEqual(withoutForged.history);
    expect(withForged.history).toEqual([enrolled]);
  });

  it('applies concurrent enrollments at the same revision independently of arrival order', async () => {
    const { genesis, identityId, owner } = await fixture();
    const first = await KeyPair.generate();
    const second = await KeyPair.generate();
    const firstRecord = record(
      enrollment(
        identityId,
        owner,
        first,
        '00000000-0000-4000-8000-000000000031',
        '10000000-0000-4000-8000-000000000031',
      ),
    );
    const secondRecord = record(
      enrollment(
        identityId,
        owner,
        second,
        '00000000-0000-4000-8000-000000000032',
        '10000000-0000-4000-8000-000000000032',
      ),
    );

    const forward = replayer.rebuild(genesis, [firstRecord, secondRecord]);
    const reversed = replayer.rebuild(genesis, [secondRecord, firstRecord]);

    expect(forward.authorization.toPrimitives()).toEqual(
      reversed.authorization.toPrimitives(),
    );
    expect(forward.history).toEqual(reversed.history);
    expect(forward.history.length).toBe(2);
    expect(forward.authorization.getCredentials().length).toBe(3);
  });

  describe('transitionLogOf', () => {
    function documentOf(
      genesis: DeviceAuthorization,
      history: OrbitDBDeviceAuthorizationTransitionRecord[],
      checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'],
    ): OrbitDBDeviceAuthorizationDocument {
      return {
        authorization: genesis.toPrimitives(),
        ...(checkpoint ? { checkpoint } : {}),
        genesis: genesis.toPrimitives(),
        history,
        id: `device-authorization:${genesis.getIdentityId().valueOf()}`,
        identityId: genesis.getIdentityId().valueOf(),
        kind: 'device_authorization',
      };
    }

    async function retiredPhone() {
      const { genesis, identityId, owner } = await fixture();
      const phone = await KeyPair.generate();
      const laptop = await KeyPair.generate();
      const attacker = await KeyPair.generate();
      const enrolled = record(
        enrollment(
          identityId,
          owner,
          phone,
          '00000000-0000-4000-8000-000000000041',
          '10000000-0000-4000-8000-000000000041',
        ),
      );
      const retired = record(
        revocation(
          identityId,
          owner,
          phone,
          '00000000-0000-4000-8000-000000000042',
          new DeviceAuthorizationRevision(1),
        ),
      );
      const forged = record(
        revocation(
          identityId,
          attacker,
          owner,
          '00000000-0000-4000-8000-000000000043',
          new DeviceAuthorizationRevision(1),
        ),
      );
      const replaced = record(
        enrollment(
          identityId,
          owner,
          laptop,
          '00000000-0000-4000-8000-000000000044',
          '10000000-0000-4000-8000-000000000044',
          new DeviceAuthorizationRevision(2),
        ),
      );

      return {
        document: documentOf(genesis, [replaced, forged, retired, enrolled]),
        genesis,
        history: [enrolled, retired, replaced],
        phone,
      };
    }

    it('serves the accepted history in replay order without rejected records', async () => {
      const { document, genesis, history } = await retiredPhone();

      const log = replayer.transitionLogOf(genesis, document);
      const full = log.disclose();

      expect(full.getRecoveries()).toEqual([]);
      expect(full.getConcurrentRecoveries()).toEqual([]);
      expect(
        full.getTransitions().map((transition) => transition.toPrimitives()),
      ).toEqual(history.map(({ transition }) => transition));
    });

    it('serves the frontier of an overflowed document', async () => {
      const { document, genesis, history } = await retiredPhone();

      const log = replayer.transitionLogOf(genesis, {
        ...documentOf(genesis, []),
        overflow: { frontier: document, sources: [] },
      });

      expect(
        log
          .disclose()
          .getTransitions()
          .map((transition) => transition.toPrimitives()),
      ).toEqual(history.map(({ transition }) => transition));
    });

    it('serves the recovery lineage and the concurrent recoveries of the checkpoint', async () => {
      const {
        genesis,
        identityId,
        owner,
        recovery: recoveryKey,
      } = await fixture();
      const recovered = await KeyPair.generate();
      const sibling = await KeyPair.generate();
      const laptop = await KeyPair.generate();
      const winner = recovery(
        identityId,
        recoveryKey,
        recovered,
        '00000000-0000-4000-8000-000000000051',
        DeviceAuthorizationRevision.initial(),
      );
      const loser = recovery(
        identityId,
        recoveryKey,
        sibling,
        '00000000-0000-4000-8000-000000000052',
        DeviceAuthorizationRevision.initial(),
      );
      const reenrolled = record(
        enrollment(
          identityId,
          recovered,
          laptop,
          '00000000-0000-4000-8000-000000000053',
          '10000000-0000-4000-8000-000000000053',
          new DeviceAuthorizationRevision(1),
          DeviceAuthorizationEpoch.fromRecovery(winner.getOperationId()),
        ),
      );
      const document = documentOf(genesis, [reenrolled], {
        authorization: policy
          .replayRecoveryLineage(genesis, [winner], [loser])
          .authorization.toPrimitives(),
        concurrent: [record(loser)],
        lineage: [],
        transition: record(winner),
      });

      const log = replayer.transitionLogOf(genesis, document);
      const full = log.disclose();

      expect(
        full.getRecoveries().map((transition) => transition.toPrimitives()),
      ).toEqual([winner.toPrimitives()]);
      expect(
        full
          .getConcurrentRecoveries()
          .map((transition) => transition.toPrimitives()),
      ).toEqual([loser.toPrimitives()]);
      expect(
        full.getTransitions().map((transition) => transition.toPrimitives()),
      ).toEqual([reenrolled.transition]);
    });
  });
});
