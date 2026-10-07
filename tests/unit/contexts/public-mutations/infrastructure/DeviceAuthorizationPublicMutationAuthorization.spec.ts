import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { PublicMutationAuthorPrimitives } from '@app/contexts/public-mutations/domain/PublicMutationAuthorPrimitives';
import DeviceAuthorizationPublicMutationAuthorization from '@app/contexts/public-mutations/infrastructure/DeviceAuthorizationPublicMutationAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe(DeviceAuthorizationPublicMutationAuthorization.name, () => {
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
  let identityId: IdentityId;
  let owner: DeviceCredential;
  let phone: DeviceCredential;
  let laptop: DeviceCredential;
  let states: DeviceAuthorization[];
  let repository: ReturnType<typeof mock<DeviceAuthorizationRepository>>;

  const credentialOf = async (): Promise<DeviceCredential> =>
    DeviceCredential.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
  const authorOf = (
    credential: DeviceCredential,
    authorizationRevision: number,
  ): PublicMutationAuthorPrimitives => ({
    authorizationRevision,
    deviceCredential: credential.valueOf(),
    identityId: identityId.valueOf(),
  });
  const authorization = (): DeviceAuthorizationPublicMutationAuthorization =>
    new DeviceAuthorizationPublicMutationAuthorization(repository);

  beforeEach(async () => {
    const identity = await KeyPair.generate();

    identityId = new IdentityId(identity.toPrimitives().publicKey);
    owner = await credentialOf();
    phone = await credentialOf();
    laptop = await credentialOf();

    const genesis = DeviceAuthorization.genesis(
      identityId,
      [networkId],
      owner,
      RecoveryAuthority.fromString(
        (await KeyPair.generate()).toPrimitives().publicKey,
      ),
    );
    const enrolled = genesis.enroll(phone);
    const revoked = enrolled.revoke(phone);
    const reenrolled = revoked.enroll(laptop);

    // revision 0 owner, 1 owner+phone, 2 phone revoked, 3 laptop enrolled
    states = [genesis, enrolled, revoked, reenrolled];
    repository = mock<DeviceAuthorizationRepository>();
    repository.findTimeline.mockResolvedValue(
      new DeviceAuthorizationTimeline(states),
    );
  });

  it('accepts a record signed while the device was authorized after its revocation arrives late', async () => {
    await expect(
      authorization().isAuthorized(authorOf(phone, 1)),
    ).resolves.toBe(true);
  });

  it('refuses a revoked device claiming the revocation revision or any later one', async () => {
    for (const revision of [2, 3]) {
      await expect(
        authorization().isAuthorized(authorOf(phone, revision)),
      ).resolves.toBe(false);
    }
  });

  it('refuses a device that was not enrolled yet at the claimed revision', async () => {
    await expect(
      authorization().isAuthorized(authorOf(laptop, 2)),
    ).resolves.toBe(false);
    await expect(
      authorization().isAuthorized(authorOf(laptop, 3)),
    ).resolves.toBe(true);
    await expect(
      authorization().isAuthorized(authorOf(phone, 0)),
    ).resolves.toBe(false);
  });

  it('keeps accepting a device that survived every later transition', async () => {
    for (const revision of [0, 1, 2, 3]) {
      await expect(
        authorization().isAuthorized(authorOf(owner, revision)),
      ).resolves.toBe(true);
    }
  });

  it('never trusts a revision above the head and accepts it once the head reaches it', async () => {
    const lagging = authorization();

    await expect(lagging.isAuthorized(authorOf(laptop, 4))).resolves.toBe(
      false,
    );

    repository.findTimeline.mockResolvedValue(
      new DeviceAuthorizationTimeline([...states, states[3].enroll(phone)]),
    );

    await expect(
      authorization().isAuthorized(authorOf(phone, 4)),
    ).resolves.toBe(true);
  });

  it('refuses an identity without a replayable authorization', async () => {
    repository.findTimeline.mockResolvedValue(undefined);

    await expect(
      authorization().isAuthorized(authorOf(owner, 0)),
    ).resolves.toBe(false);
  });

  it('gives the same verdicts whatever order the states were replayed in', async () => {
    const verdicts = async (
      ordered: DeviceAuthorization[],
    ): Promise<boolean[]> => {
      repository.findTimeline.mockResolvedValue(
        new DeviceAuthorizationTimeline(ordered),
      );
      const fresh = authorization();

      return Promise.all(
        [owner, phone, laptop].flatMap((credential) =>
          [0, 1, 2, 3, 4].map((revision) =>
            fresh.isAuthorized(authorOf(credential, revision)),
          ),
        ),
      );
    };
    const expected = await verdicts(states);

    for (const shuffled of [
      [...states].reverse(),
      [states[2], states[0], states[3], states[1]],
      [states[1], states[3], states[0], states[2]],
    ]) {
      await expect(verdicts(shuffled)).resolves.toEqual(expected);
    }
  });
});
