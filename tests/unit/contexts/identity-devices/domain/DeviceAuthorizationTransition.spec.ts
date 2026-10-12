import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationEpoch } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

type CompromisedCredential = {
  compromisedSince: DeviceAuthorizationRevision;
  credential: DeviceCredential;
};

const revision = (value: number): DeviceAuthorizationRevision =>
  new DeviceAuthorizationRevision(value);

describe(DeviceAuthorizationTransition.name, () => {
  const operationId = new DeviceAuthorizationOperationId(
    '00000000-0000-4000-8000-000000000001',
  );
  let identityId: IdentityId;
  let target: KeyPair;
  let authority: KeyPair;

  beforeEach(async () => {
    identityId = new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    target = await KeyPair.generate();
    authority = await KeyPair.generate();
  });

  async function credentials(count: number): Promise<DeviceCredential[]> {
    const keys = await Promise.all(
      Array.from({ length: count }, () => KeyPair.generate()),
    );

    return keys
      .map((key) => DeviceCredential.fromString(key.toPrimitives().publicKey))
      .sort((left, right) => (left.valueOf() < right.valueOf() ? -1 : 1));
  }

  function unsignedRecovery(
    compromisedCredentials?: CompromisedCredential[],
    previousRevision = revision(2),
  ): DeviceAuthorizationTransition {
    return DeviceAuthorizationTransition.recovery(
      identityId,
      operationId,
      previousRevision,
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      DeviceAuthorizationEpoch.genesis(),
      compromisedCredentials,
    );
  }

  function signedRecovery(
    compromisedCredentials?: CompromisedCredential[],
  ): DeviceAuthorizationTransition {
    const unsigned = unsignedRecovery(compromisedCredentials);
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorizeRecovery(authority.sign(proven.getSigningPayload()));
  }

  it('keeps compromised credentials in canonical order through primitives', async () => {
    const [first, second] = await credentials(2);
    const primitives = signedRecovery([
      { compromisedSince: revision(1), credential: first },
      { compromisedSince: revision(2), credential: second },
    ]).toPrimitives();

    expect(primitives.compromisedCredentials).toEqual([
      { compromisedSince: 1, credential: first.valueOf() },
      { compromisedSince: 2, credential: second.valueOf() },
    ]);
    expect(
      DeviceAuthorizationTransition.fromPrimitives(primitives).toPrimitives(),
    ).toEqual(primitives);
  });

  it('refuses compromised credentials that are not in canonical order', async () => {
    const [first, second] = await credentials(2);

    expect(() =>
      unsignedRecovery([
        { compromisedSince: revision(1), credential: second },
        { compromisedSince: revision(1), credential: first },
      ]),
    ).toThrow();
  });

  it('refuses a credential listed twice', async () => {
    const [first] = await credentials(1);

    expect(() =>
      unsignedRecovery([
        { compromisedSince: revision(1), credential: first },
        { compromisedSince: revision(2), credential: first },
      ]),
    ).toThrow();
  });

  it('refuses an empty compromised credential list', () => {
    expect(() => unsignedRecovery([])).toThrow();
  });

  it('accepts exactly the compromised credential bound', async () => {
    const list = (await credentials(32)).map((credential) => ({
      compromisedSince: revision(1),
      credential,
    }));

    expect(() => unsignedRecovery(list)).not.toThrow();
  });

  it('refuses more compromised credentials than the bound', async () => {
    const list = (await credentials(33)).map((credential) => ({
      compromisedSince: revision(1),
      credential,
    }));

    expect(() => unsignedRecovery(list)).toThrow();
  });

  it('refuses a compromise revision beyond the recovery previous revision', async () => {
    const [first] = await credentials(1);

    expect(() =>
      unsignedRecovery(
        [{ compromisedSince: revision(3), credential: first }],
        revision(2),
      ),
    ).toThrow();
  });

  it('accepts a compromise revision equal to the recovery previous revision', async () => {
    const [first] = await credentials(1);

    expect(() =>
      unsignedRecovery(
        [{ compromisedSince: revision(2), credential: first }],
        revision(2),
      ),
    ).not.toThrow();
  });

  it('binds compromised credentials into the recovery signing payload', async () => {
    const [first] = await credentials(1);

    expect(
      unsignedRecovery([{ compromisedSince: revision(1), credential: first }])
        .getSigningPayload(),
    ).not.toEqual(unsignedRecovery().getSigningPayload());
  });
});
