import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationValue } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperation';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

describe(DeviceAuthorization.name, () => {
  const now = new Timestamp(1_800_000_000_000);
  let owner: KeyPair;
  let identity: KeyPair;
  let candidate: KeyPair;
  let recovery: KeyPair;
  let identityId: IdentityId;
  let authorization: DeviceAuthorization;
  let policy: DeviceAuthorizationPolicy;

  beforeEach(async () => {
    owner = await KeyPair.generate();
    identity = await KeyPair.generate();
    candidate = await KeyPair.generate();
    recovery = await KeyPair.generate();
    identityId = new IdentityId(identity.toPrimitives().publicKey);
    authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    policy = new DeviceAuthorizationPolicy();
  });

  async function enrollment(
    overrides: {
      author?: KeyPair;
      identityId?: IdentityId;
      operationId?: DeviceAuthorizationOperationId;
      pairingExpiration?: PairingExpiration;
      pairingId?: PairingId;
      previousRevision?: DeviceAuthorizationRevision;
      target?: KeyPair;
    } = {},
  ): Promise<DeviceAuthorizationTransition> {
    const author = overrides.author ?? owner;
    const target = overrides.target ?? candidate;
    const unsigned = DeviceAuthorizationTransition.enrollment(
      overrides.identityId ?? identityId,
      overrides.operationId ?? DeviceAuthorizationOperationId.generate(),
      overrides.previousRevision ?? DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(author.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        overrides.pairingId ?? PairingId.generate(),
        overrides.pairingExpiration ??
          new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );

    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(author.sign(proven.getSigningPayload()));
  }

  it('enrolls a credential with author and target proof of possession', async () => {
    const transition = await enrollment();
    const next = policy.apply(
      authorization,
      DeviceAuthorizationTransition.fromPrimitives(transition.toPrimitives()),
    );

    expect(
      next.isAuthorized(
        DeviceCredential.fromString(candidate.toPrimitives().publicKey),
      ),
    ).toBe(true);
    expect(next.getRevision().valueOf()).toBe(1);
  });

  it('rejects a substituted target credential', async () => {
    const attacker = await KeyPair.generate();
    const transition = await enrollment();

    expect(() =>
      policy.apply(
        authorization,
        transition.withTargetCredential(
          DeviceCredential.fromString(attacker.toPrimitives().publicKey),
        ),
      ),
    ).toThrow();
  });

  it('rejects a pairing expiration before its signed authorization time', async () => {
    await expect(
      enrollment({
        pairingExpiration: new PairingExpiration(now.valueOf() - 1),
      }),
    ).rejects.toThrow();
  });

  it('rejects first acceptance after the signed pairing expiration', async () => {
    const expiration = new PairingExpiration(now.valueOf() + 1);
    const transition = await enrollment({ pairingExpiration: expiration });

    expect(() =>
      policy.verifyFirstAcceptance(
        transition,
        new Timestamp(expiration.valueOf() + 1),
      ),
    ).toThrow();
    expect(() => policy.apply(authorization, transition)).not.toThrow();
  });

  it('binds the author signature to the target proof of possession', async () => {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(candidate.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );
    const signatureWithoutProof = owner.sign(unsigned.getSigningPayload());
    const proven = unsigned.provePossession(
      candidate.sign(unsigned.getProofOfPossessionPayload()),
    );

    expect(() =>
      policy.apply(authorization, proven.authorize(signatureWithoutProof)),
    ).toThrow();
  });

  it('uses the documented byte-exact enrollment signature payloads', () => {
    const operationId = new DeviceAuthorizationOperationId(
      '00000000-0000-4000-8000-000000000001',
    );
    const pairingId = new PairingId(
      '10000000-0000-4000-8000-000000000001',
    );
    const expiration = new PairingExpiration(now.valueOf() + 60_000);
    const authorCredential = DeviceCredential.fromString(
      owner.toPrimitives().publicKey,
    );
    const targetCredential = DeviceCredential.fromString(
      candidate.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      operationId,
      DeviceAuthorizationRevision.initial(),
      authorCredential,
      targetCredential,
      new PairingAuthorization(pairingId, expiration, now),
    );
    const transition = JSON.stringify({
      authorCredential: authorCredential.valueOf(),
      authorizedAt: now.valueOf(),
      identityId: identityId.valueOf(),
      operation: 'enroll',
      operationId: operationId.valueOf(),
      pairingExpiration: expiration.valueOf(),
      pairingId: pairingId.valueOf(),
      previousRevision: 0,
      revision: 1,
      targetCredential: targetCredential.valueOf(),
      targetCredentialCommitment: targetCredential.getCommitment().valueOf(),
    });

    expect(unsigned.getProofOfPossessionPayload().valueOf()).toBe(
      `{"domain":"pigeon:device-authorization:proof-of-possession:v1","transition":${transition}}`,
    );
    const proofOfPossession = candidate.sign(
      unsigned.getProofOfPossessionPayload(),
    );
    const proven = unsigned.provePossession(proofOfPossession);

    expect(proven.getSigningPayload().valueOf()).toBe(
      `{"domain":"pigeon:device-authorization:transition:v2","proofOfPossession":${JSON.stringify(proofOfPossession.valueOf())},"transition":${transition}}`,
    );
  });

  it('rejects substitution of the signed pairing authorization time', async () => {
    const primitives = (await enrollment()).toPrimitives();
    const substituted = DeviceAuthorizationTransition.fromPrimitives({
      ...primitives,
      authorizedAt: now.valueOf() - 1,
    });

    expect(() => policy.apply(authorization, substituted)).toThrow();
  });

  it('rejects a transition with the wrong predecessor revision', async () => {
    const transition = await enrollment({
      previousRevision: new DeviceAuthorizationRevision(3),
    });

    expect(() => policy.apply(authorization, transition)).toThrow();
  });

  it('rejects a transition substituted into another identity', async () => {
    const otherOwner = await KeyPair.generate();
    const otherIdentity = new IdentityId(otherOwner.toPrimitives().publicKey);
    const transition = await enrollment({ identityId: otherIdentity });

    expect(() => policy.apply(authorization, transition)).toThrow();
  });

  it('rejects recovery signed by an unrelated authority', async () => {
    const attacker = await KeyPair.generate();
    const target = DeviceCredential.fromString(
      candidate.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      target,
    );
    const proven = unsigned.provePossession(
      candidate.sign(unsigned.getProofOfPossessionPayload()),
    );
    const transition = proven.authorizeRecovery(
      attacker.sign(proven.getSigningPayload()),
    );

    expect(() => policy.apply(authorization, transition)).toThrow();
  });

  it('recovers with the pinned recovery authority and replaces old devices', async () => {
    const target = DeviceCredential.fromString(
      candidate.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      target,
    );
    const proven = unsigned.provePossession(
      candidate.sign(unsigned.getProofOfPossessionPayload()),
    );
    const recovered = policy.apply(
      authorization,
      proven.authorizeRecovery(recovery.sign(proven.getSigningPayload())),
    );

    expect(recovered.getCredentials()).toHaveLength(1);
    expect(recovered.isAuthorized(target)).toBe(true);
    expect(
      recovered.isAuthorized(
        DeviceCredential.fromString(owner.toPrimitives().publicKey),
      ),
    ).toBe(false);
  });

  it('rejects a serialized target commitment that does not match its credential', async () => {
    const primitives = (await enrollment()).toPrimitives();

    expect(() =>
      DeviceAuthorizationTransition.fromPrimitives({
        ...primitives,
        targetCredentialCommitment: '0'.repeat(64),
      }),
    ).toThrow();
  });

  it('rejects enrollment fields on a revocation', async () => {
    const primitives = (await enrollment()).toPrimitives();

    expect(() =>
      DeviceAuthorizationTransition.fromPrimitives({
        ...primitives,
        operation: DeviceAuthorizationOperationValue.REVOKE,
      }),
    ).toThrow();
  });

  it('rejects a recovery carrying an author credential', async () => {
    const target = DeviceCredential.fromString(
      candidate.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.recovery(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      target,
    );
    const proven = unsigned.provePossession(
      candidate.sign(unsigned.getProofOfPossessionPayload()),
    );
    const primitives = proven
      .authorizeRecovery(recovery.sign(proven.getSigningPayload()))
      .toPrimitives();

    expect(() =>
      DeviceAuthorizationTransition.fromPrimitives({
        ...primitives,
        authorCredential: owner.toPrimitives().publicKey,
      }),
    ).toThrow();
  });

  it('rejects an author after its credential is revoked', async () => {
    const enrolled = policy.apply(authorization, await enrollment());
    const candidateCredential = DeviceCredential.fromString(
      candidate.toPrimitives().publicKey,
    );
    const unsignedRevocation = DeviceAuthorizationTransition.revocation(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      enrolled.getRevision(),
      candidateCredential,
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
    );
    const revoked = policy.apply(
      enrolled,
      unsignedRevocation.authorize(
        candidate.sign(unsignedRevocation.getSigningPayload()),
      ),
    );

    const attemptedEnrollment = await enrollment({
      author: owner,
      previousRevision: revoked.getRevision(),
      target: await KeyPair.generate(),
    });

    expect(() => policy.apply(revoked, attemptedEnrollment)).toThrow();
  });
});
