import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceCompromiseCaps } from '@app/contexts/identity-devices/domain/DeviceCompromiseCaps';
import { DeviceAuthorizationEpoch } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

type CompromisedCredential = {
  compromisedSince: DeviceAuthorizationRevision;
  credential: DeviceCredential;
};

const revision = (value: number): DeviceAuthorizationRevision =>
  new DeviceAuthorizationRevision(value);

describe(DeviceCompromiseCaps.name, () => {
  const operationId = new DeviceAuthorizationOperationId(
    '00000000-0000-4000-8000-000000000001',
  );
  let identityId: IdentityId;
  let author: DeviceCredential;
  let phone: DeviceCredential;
  let laptop: DeviceCredential;

  beforeEach(async () => {
    identityId = new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    author = DeviceCredential.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    phone = DeviceCredential.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    laptop = DeviceCredential.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
  });

  function revocation(
    target: DeviceCredential,
    compromisedSince?: DeviceAuthorizationRevision,
  ): DeviceAuthorizationTransition {
    return DeviceAuthorizationTransition.revocation(
      identityId,
      operationId,
      revision(2),
      author,
      target,
      DeviceAuthorizationEpoch.genesis(),
      compromisedSince,
    );
  }

  function recovery(
    compromisedCredentials?: CompromisedCredential[],
  ): DeviceAuthorizationTransition {
    return DeviceAuthorizationTransition.recovery(
      identityId,
      operationId,
      revision(2),
      laptop,
      DeviceAuthorizationEpoch.genesis(),
      compromisedCredentials,
    );
  }

  it('refuses a compromised credential from its named revision onward', () => {
    const caps = DeviceCompromiseCaps.none().withCompromise(
      revocation(phone, revision(1)),
    );

    expect(caps.isCompromisedAt(phone, revision(0))).toBe(false);
    expect(caps.isCompromisedAt(phone, revision(1))).toBe(true);
    expect(caps.isCompromisedAt(phone, revision(2))).toBe(true);
    expect(caps.isCompromisedAt(laptop, revision(2))).toBe(false);
  });

  it('keeps the lowest cap a credential receives in any merge order', () => {
    const lowestFirst = DeviceCompromiseCaps.none()
      .withCompromise(revocation(phone, revision(1)))
      .withCompromise(revocation(phone, revision(2)));
    const highestFirst = DeviceCompromiseCaps.none()
      .withCompromise(revocation(phone, revision(2)))
      .withCompromise(revocation(phone, revision(1)));

    expect(lowestFirst.toPrimitives()).toEqual([
      { compromisedSince: 1, credential: phone.valueOf() },
    ]);
    expect(highestFirst.toPrimitives()).toEqual([
      { compromisedSince: 1, credential: phone.valueOf() },
    ]);
  });

  it('carries its caps through a recovery and refuses a later one that loosens or drops a cap', () => {
    const carried = DeviceCompromiseCaps.carriedBy(
      recovery([{ compromisedSince: revision(1), credential: phone }]),
    );

    expect(
      carried.isNotLoosenedBy(
        DeviceCompromiseCaps.carriedBy(
          recovery([{ compromisedSince: revision(1), credential: phone }]),
        ),
      ),
    ).toBe(true);
    expect(
      carried.isNotLoosenedBy(
        DeviceCompromiseCaps.carriedBy(
          recovery([{ compromisedSince: revision(0), credential: phone }]),
        ),
      ),
    ).toBe(true);
    expect(
      carried.isNotLoosenedBy(
        DeviceCompromiseCaps.carriedBy(
          recovery([{ compromisedSince: revision(2), credential: phone }]),
        ),
      ),
    ).toBe(false);
    expect(carried.isNotLoosenedBy(DeviceCompromiseCaps.none())).toBe(false);
  });

  it('requires a recovery to carry exactly the caps in effect', () => {
    const caps = DeviceCompromiseCaps.none().withCompromise(
      revocation(phone, revision(1)),
    );

    expect(
      caps.isCarriedBy(
        recovery([{ compromisedSince: revision(1), credential: phone }]),
      ),
    ).toBe(true);
    expect(caps.isCarriedBy(recovery())).toBe(false);
    expect(
      caps.isCarriedBy(
        recovery([{ compromisedSince: revision(2), credential: phone }]),
      ),
    ).toBe(false);
  });
});
