import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretPublisherNotAuthorizedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretPublisherNotAuthorizedError';
import { DeviceSealedSecretRecipientsMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceSealedSecretRevisionMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { InvalidDeviceSealedSecretSignatureError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretSignatureError';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

import {
  bundleOf,
  credentialOf,
  EnrolledDeviceFixture,
  enrolledDeviceFixture,
  retirementOf,
  sealedEntry,
  singleDeviceFixture,
} from '../DeviceSealedSecretFixtures';

function handoverBy(
  fixture: EnrolledDeviceFixture,
  overrides: {
    authorizationRevision?: number;
    publisher?: KeyPair;
    recipients?: KeyPair[];
    signer?: KeyPair;
  } = {},
): DeviceSealedSecretBundle {
  const publisher = overrides.publisher ?? fixture.candidate;
  const authorizationRevision = overrides.authorizationRevision ?? 2;

  return bundleOf({
    authorizationRevision,
    entries: (overrides.recipients ?? [fixture.owner]).map((recipient) => {
      const entry = sealedEntry({
        authorizationRevision,
        generation: 2,
        identityId: fixture.identityId,
        publisher,
        recipient,
      });
      const payload = DeviceSealedSecretBundle.signingPayload({
        authorizationRevision,
        generation: 2,
        identityId: fixture.identityId,
        publisherCredential: credentialOf(publisher),
        recipientCredential: entry.recipientCredential,
        sealedSecret: entry.sealedSecret,
      });

      return overrides.signer
        ? { ...entry, signature: overrides.signer.sign(payload).valueOf() }
        : entry;
    }),
    generation: 2,
    identityId: fixture.identityId,
    publisher,
  });
}

function selfRetirement(
  fixture: EnrolledDeviceFixture,
): DeviceAuthorizationTransition {
  return retirementOf({
    author: fixture.candidate,
    identityId: fixture.identityId,
    previousRevision: 1,
    target: fixture.candidate,
  });
}

describe(`${DeviceSealedSecretBundle.name} hand-over`, () => {
  it('accepts a bundle the retiring device seals to the remaining devices at the retirement revision', async () => {
    const fixture = await enrolledDeviceFixture();

    expect(() =>
      handoverBy(fixture).assertHandedOverBy(
        selfRetirement(fixture),
        fixture.authorization,
      ),
    ).not.toThrow();
  });

  it('rejects a hand-over on a revocation of another device', async () => {
    const fixture = await enrolledDeviceFixture();
    const revocation = retirementOf({
      author: fixture.owner,
      identityId: fixture.identityId,
      previousRevision: 1,
      target: fixture.candidate,
    });

    expect(() =>
      handoverBy(fixture, { publisher: fixture.owner }).assertHandedOverBy(
        revocation,
        fixture.authorization,
      ),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects a hand-over on a compromise revocation', async () => {
    const fixture = await enrolledDeviceFixture();
    const compromise = retirementOf({
      author: fixture.candidate,
      compromisedSince: 0,
      identityId: fixture.identityId,
      previousRevision: 1,
      target: fixture.candidate,
    });

    expect(() =>
      handoverBy(fixture).assertHandedOverBy(compromise, fixture.authorization),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects a hand-over on an enrollment', async () => {
    const fixture = await enrolledDeviceFixture();
    const enrollment = DeviceAuthorizationTransition.enrollment(
      new IdentityId(fixture.identityId),
      DeviceAuthorizationOperationId.generate(),
      new DeviceAuthorizationRevision(1),
      DeviceCredential.fromString(fixture.candidate.toPrimitives().publicKey),
      DeviceCredential.fromString(
        (await KeyPair.generate()).toPrimitives().publicKey,
      ),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Timestamp.now().valueOf() + 60_000),
        Timestamp.now(),
      ),
    );

    expect(() =>
      handoverBy(fixture).assertHandedOverBy(enrollment, fixture.authorization),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects a bundle published by a device other than the retiring one', async () => {
    const fixture = await enrolledDeviceFixture();

    expect(() =>
      handoverBy(fixture, { publisher: fixture.owner }).assertHandedOverBy(
        selfRetirement(fixture),
        fixture.authorization,
      ),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects a bundle that still seals the root to the retiring device', async () => {
    const fixture = await enrolledDeviceFixture();

    expect(() =>
      handoverBy(fixture, {
        recipients: [fixture.owner, fixture.candidate],
      }).assertHandedOverBy(selfRetirement(fixture), fixture.authorization),
    ).toThrow(DeviceSealedSecretRecipientsMismatchError);
  });

  it('rejects a bundle built for the revision before the retirement', async () => {
    const fixture = await enrolledDeviceFixture();

    expect(() =>
      handoverBy(fixture, { authorizationRevision: 1 }).assertHandedOverBy(
        selfRetirement(fixture),
        fixture.authorization,
      ),
    ).toThrow(DeviceSealedSecretRevisionMismatchError);
  });

  it('rejects an entry not signed by the retiring device', async () => {
    const fixture = await enrolledDeviceFixture();

    expect(() =>
      handoverBy(fixture, { signer: fixture.owner }).assertHandedOverBy(
        selfRetirement(fixture),
        fixture.authorization,
      ),
    ).toThrow(InvalidDeviceSealedSecretSignatureError);
  });

  it('rejects a retiring device outside the authorization set', async () => {
    const fixture = await enrolledDeviceFixture();
    const stranger = await KeyPair.generate();
    const retirement = retirementOf({
      author: stranger,
      identityId: fixture.identityId,
      previousRevision: 1,
      target: stranger,
    });

    expect(() =>
      handoverBy(fixture, { publisher: stranger }).assertHandedOverBy(
        retirement,
        fixture.authorization,
      ),
    ).toThrow(DeviceSealedSecretPublisherNotAuthorizedError);
  });

  it('rejects the last authorized device retiring itself', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const bundle = bundleOf({
      authorizationRevision: 1,
      entries: [
        sealedEntry({
          authorizationRevision: 1,
          generation: 2,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      generation: 2,
      identityId,
      publisher: owner,
    });
    const retirement = retirementOf({
      author: owner,
      identityId,
      previousRevision: 0,
      target: owner,
    });

    expect(() => bundle.assertHandedOverBy(retirement, authorization)).toThrow(
      InvalidDeviceAuthorizationTransitionError,
    );
  });

  it('is addressed only to the authorization the retirement produces', async () => {
    const fixture = await enrolledDeviceFixture();
    const bundle = handoverBy(fixture);
    const retired = fixture.authorization.revoke(
      DeviceCredential.fromString(fixture.candidate.toPrimitives().publicKey),
    );

    expect(bundle.isAddressedTo(retired)).toBe(true);
    expect(bundle.isAddressedTo(fixture.authorization)).toBe(false);
  });
});
