import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionDisclosure } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionDisclosure';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationEpoch } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

describe(DeviceAuthorizationTransitionLog.name, () => {
  const now = new Timestamp(1_800_000_000_000);
  const policy = new DeviceAuthorizationPolicy();
  const credentialOf = (key: KeyPair): DeviceCredential =>
    DeviceCredential.fromString(key.toPrimitives().publicKey);
  const revisionOf = (value: number): DeviceAuthorizationRevision =>
    new DeviceAuthorizationRevision(value);
  const primitivesOf = (transitions: DeviceAuthorizationTransition[]) =>
    transitions.map((transition) => transition.toPrimitives());

  function enrollment(
    identityId: IdentityId,
    author: KeyPair,
    target: KeyPair,
    operationId: string,
    previousRevision: number,
    epoch = DeviceAuthorizationEpoch.genesis(),
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      revisionOf(previousRevision),
      credentialOf(author),
      credentialOf(target),
      new PairingAuthorization(
        new PairingId(operationId.replace(/^0/, '1')),
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
      epoch,
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(author.sign(proven.getSigningPayload()));
  }

  function revocation(
    identityId: IdentityId,
    author: KeyPair,
    target: KeyPair,
    operationId: string,
    previousRevision: number,
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.revocation(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      revisionOf(previousRevision),
      credentialOf(author),
      credentialOf(target),
      DeviceAuthorizationEpoch.genesis(),
    );

    return unsigned.authorize(author.sign(unsigned.getSigningPayload()));
  }

  function recovery(
    identityId: IdentityId,
    authority: KeyPair,
    target: KeyPair,
    operationId: string,
    previousRevision: number,
  ): DeviceAuthorizationTransition {
    const unsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      new DeviceAuthorizationOperationId(operationId),
      revisionOf(previousRevision),
      credentialOf(target),
      DeviceAuthorizationEpoch.genesis(),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorizeRecovery(authority.sign(proven.getSigningPayload()));
  }

  async function fixture() {
    const [identity, owner, phone, laptop, recoveryKey] = await Promise.all([
      KeyPair.generate(),
      KeyPair.generate(),
      KeyPair.generate(),
      KeyPair.generate(),
      KeyPair.generate(),
    ]);
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const genesis = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      credentialOf(owner),
      RecoveryAuthority.fromString(recoveryKey.toPrimitives().publicKey),
    );

    return { genesis, identityId, laptop, owner, phone, recoveryKey };
  }

  async function retiredPhoneLog() {
    const context = await fixture();
    const { genesis, identityId, laptop, owner, phone } = context;
    const transitions = [
      enrollment(
        identityId,
        owner,
        phone,
        '00000000-0000-4000-8000-000000000001',
        0,
      ),
      revocation(
        identityId,
        owner,
        phone,
        '00000000-0000-4000-8000-000000000002',
        1,
      ),
      enrollment(
        identityId,
        owner,
        laptop,
        '00000000-0000-4000-8000-000000000003',
        2,
      ),
    ];
    const enrolled = genesis.enroll(credentialOf(phone));
    const retired = enrolled.revoke(credentialOf(phone));
    const log = new DeviceAuthorizationTransitionLog([], [], transitions, [
      genesis,
      enrolled,
      retired,
      retired.enroll(credentialOf(laptop)),
    ]);

    return { ...context, log, transitions };
  }

  async function recoveredLog() {
    const context = await fixture();
    const { genesis, identityId, laptop, owner, recoveryKey } = context;
    const recovered = await KeyPair.generate();
    const sibling = await KeyPair.generate();
    const winner = recovery(
      identityId,
      recoveryKey,
      recovered,
      '00000000-0000-4000-8000-000000000011',
      0,
    );
    const loser = recovery(
      identityId,
      recoveryKey,
      sibling,
      '00000000-0000-4000-8000-000000000012',
      0,
    );
    const base = policy.replayRecoveryLineage(
      genesis,
      [winner],
      [loser],
    ).authorization;
    const reenrollment = enrollment(
      identityId,
      recovered,
      laptop,
      '00000000-0000-4000-8000-000000000013',
      1,
      DeviceAuthorizationEpoch.fromRecovery(winner.getOperationId()),
    );
    const log = new DeviceAuthorizationTransitionLog(
      [winner],
      [loser],
      [reenrollment],
      [base, base.enroll(credentialOf(laptop))],
    );

    return { ...context, log, loser, owner, reenrollment, winner };
  }

  function expectDisclosure(
    disclosure: DeviceAuthorizationTransitionDisclosure,
    expected: {
      concurrentRecoveries: DeviceAuthorizationTransition[];
      identityId: IdentityId;
      recoveries: DeviceAuthorizationTransition[];
      transitions: DeviceAuthorizationTransition[];
    },
  ): void {
    expect(disclosure.getIdentityId().isEqual(expected.identityId)).toBe(true);
    expect(primitivesOf(disclosure.getRecoveries())).toEqual(
      primitivesOf(expected.recoveries),
    );
    expect(primitivesOf(disclosure.getConcurrentRecoveries())).toEqual(
      primitivesOf(expected.concurrentRecoveries),
    );
    expect(primitivesOf(disclosure.getTransitions())).toEqual(
      primitivesOf(expected.transitions),
    );
  }

  it('discloses every transition of a log with a retired device', async () => {
    const { identityId, log, transitions } = await retiredPhoneLog();

    expectDisclosure(log.disclose(), {
      concurrentRecoveries: [],
      identityId,
      recoveries: [],
      transitions,
    });
  });

  it('discloses the recovery lineage together with the history', async () => {
    const { identityId, log, loser, reenrollment, winner } =
      await recoveredLog();

    expectDisclosure(log.disclose(), {
      concurrentRecoveries: [loser],
      identityId,
      recoveries: [winner],
      transitions: [reenrollment],
    });
  });

  it('keeps only the entries signed after a revision', async () => {
    const retired = await retiredPhoneLog();
    const recovered = await recoveredLog();

    expectDisclosure(retired.log.disclose().page(revisionOf(1), 100), {
      concurrentRecoveries: [],
      identityId: retired.identityId,
      recoveries: [],
      transitions: retired.transitions.slice(1),
    });
    expectDisclosure(recovered.log.disclose().page(revisionOf(1), 100), {
      concurrentRecoveries: [],
      identityId: recovered.identityId,
      recoveries: [],
      transitions: [recovered.reenrollment],
    });
  });

  it('never lets a caller change a disclosure through the returned lists', async () => {
    const { log } = await retiredPhoneLog();
    const disclosure = log.disclose();

    disclosure.getTransitions().pop();

    expect(disclosure.getTransitions()).toHaveLength(3);
  });

  it('names the recovery authority of the identity', async () => {
    const { genesis, log } = await retiredPhoneLog();

    expect(
      log.getRecoveryAuthority().isEqual(genesis.getRecoveryAuthority()),
    ).toBe(true);
  });

  it('refuses a log without a replayed state', () => {
    expect(() => new DeviceAuthorizationTransitionLog([], [], [], [])).toThrow(
      InvalidDeviceAuthorizationTransitionError,
    );
  });
});
