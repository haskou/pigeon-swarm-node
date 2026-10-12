import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import {
  DeviceSealedSecretBundle,
  DeviceSealedSecretBundlePrimitives,
  DeviceSealedSecretEntryPrimitives,
} from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretPublisherNotAuthorizedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretPublisherNotAuthorizedError';
import { DeviceSealedSecretRecipientsMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceSealedSecretRevisionMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { InvalidDeviceSealedSecretSignatureError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretSignatureError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

const SEALED = 'v2.x25519-hkdf-sha256-aes-256-gcm.ZXBo.aXY.Y3Q.dGFn';

function credentialOf(pair: KeyPair): string {
  return new IdentityId(pair.toPrimitives().publicKey).valueOf();
}

interface Fixture {
  authorization: DeviceAuthorization;
  identityId: string;
  owner: KeyPair;
}

async function singleDeviceFixture(): Promise<Fixture> {
  const owner = await KeyPair.generate();
  const identityId = new IdentityId(
    (await KeyPair.generate()).toPrimitives().publicKey,
  );
  const authorization = DeviceAuthorization.genesis(
    identityId,
    [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    RecoveryAuthority.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    ),
  );

  return { authorization, identityId: identityId.valueOf(), owner };
}

async function enrolledDeviceFixture(): Promise<
  Fixture & { candidate: KeyPair }
> {
  const base = await singleDeviceFixture();
  const candidate = await KeyPair.generate();
  const unsigned = DeviceAuthorizationTransition.enrollment(
    new IdentityId(base.identityId),
    DeviceAuthorizationOperationId.generate(),
    DeviceAuthorizationRevision.initial(),
    DeviceCredential.fromString(base.owner.toPrimitives().publicKey),
    DeviceCredential.fromString(candidate.toPrimitives().publicKey),
    new PairingAuthorization(
      PairingId.generate(),
      new PairingExpiration(Timestamp.now().valueOf() + 60_000),
      Timestamp.now(),
    ),
  );
  const proven = unsigned.provePossession(
    candidate.sign(unsigned.getProofOfPossessionPayload()),
  );
  const transition = proven.authorize(
    base.owner.sign(proven.getSigningPayload()),
  );
  const authorization = new DeviceAuthorizationPolicy().apply(
    base.authorization,
    DeviceAuthorizationTransition.fromPrimitives(transition.toPrimitives()),
  );

  return { authorization, candidate, identityId: base.identityId, owner: base.owner };
}

interface SealInput {
  authorizationRevision: number;
  generation: number;
  identityId: string;
  publisher: KeyPair;
  recipient: KeyPair;
  sealedSecret?: string;
}

function signingPayload(input: SealInput): string {
  return DeviceSealedSecretBundle.signingPayload({
    authorizationRevision: input.authorizationRevision,
    generation: input.generation,
    identityId: input.identityId,
    publisherCredential: credentialOf(input.publisher),
    recipientCredential: credentialOf(input.recipient),
    sealedSecret: input.sealedSecret ?? SEALED,
  });
}

function sealedEntry(input: SealInput): DeviceSealedSecretEntryPrimitives {
  return {
    recipientCredential: credentialOf(input.recipient),
    sealedSecret: input.sealedSecret ?? SEALED,
    signature: input.publisher.sign(signingPayload(input)).valueOf(),
  };
}

function bundleOf(
  input: Partial<DeviceSealedSecretBundlePrimitives> & {
    identityId: string;
    publisher: KeyPair;
  },
): DeviceSealedSecretBundle {
  return DeviceSealedSecretBundle.fromPrimitives({
    authorizationRevision: 0,
    entries: [],
    generation: 1,
    identityId: input.identityId,
    publisherCredential: credentialOf(input.publisher),
    ...input,
  });
}

describe(DeviceSealedSecretBundle.name, () => {
  it('accepts a bundle sealed to exactly the authorized credentials', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const candidate = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });

    expect(() => candidate.assertPublishableBy(authorization)).not.toThrow();
  });

  it('rejects a bundle that omits an authorized credential', async () => {
    const { authorization, identityId, owner } =
      await enrolledDeviceFixture();
    const bundle = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 1,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      authorizationRevision: 1,
      identityId,
      publisher: owner,
    });

    expect(() => bundle.assertPublishableBy(authorization)).toThrow(
      DeviceSealedSecretRecipientsMismatchError,
    );
  });

  it('rejects a bundle sealed to a credential outside the authorization set', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const outsider = await KeyPair.generate();
    const candidate = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: outsider,
        }),
      ],
      identityId,
      publisher: owner,
    });

    expect(() => candidate.assertPublishableBy(authorization)).toThrow(
      DeviceSealedSecretRecipientsMismatchError,
    );
  });

  it('rejects a publisher outside the authorization set', async () => {
    const { authorization, identityId } = await singleDeviceFixture();
    const outsider = await KeyPair.generate();
    const candidate = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: outsider,
          recipient: outsider,
        }),
      ],
      identityId,
      publisher: outsider,
    });

    expect(() => candidate.assertPublishableBy(authorization)).toThrow(
      DeviceSealedSecretPublisherNotAuthorizedError,
    );
  });

  it('rejects a bundle built for a different authorization revision', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const candidate = bundleOf({
      authorizationRevision: 7,
      entries: [
        sealedEntry({
          authorizationRevision: 7,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });

    expect(() => candidate.assertPublishableBy(authorization)).toThrow(
      DeviceSealedSecretRevisionMismatchError,
    );
  });

  it('rejects an entry signed for another generation', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const candidate = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 2,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      generation: 1,
      identityId,
      publisher: owner,
    });

    expect(() => candidate.assertPublishableBy(authorization)).toThrow(
      InvalidDeviceSealedSecretSignatureError,
    );
  });

  it('rejects an entry signed by a key other than the publisher', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const forger = await KeyPair.generate();
    const forged = sealedEntry({
      authorizationRevision: 0,
      generation: 1,
      identityId,
      publisher: forger,
      recipient: owner,
    });
    const candidate = bundleOf({
      entries: [forged],
      identityId,
      publisher: owner,
    });

    expect(() => candidate.assertPublishableBy(authorization)).toThrow(
      InvalidDeviceSealedSecretSignatureError,
    );
  });

  it('rejects duplicate recipients', async () => {
    const { identityId, owner } = await singleDeviceFixture();
    const sealed = sealedEntry({
      authorizationRevision: 0,
      generation: 1,
      identityId,
      publisher: owner,
      recipient: owner,
    });

    expect(() =>
      bundleOf({ entries: [sealed, sealed], identityId, publisher: owner }),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects an empty entry list', async () => {
    const { identityId, owner } = await singleDeviceFixture();

    expect(() =>
      bundleOf({ entries: [], identityId, publisher: owner }),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects a generation below one', async () => {
    const { identityId, owner } = await singleDeviceFixture();

    expect(() =>
      bundleOf({
        entries: [
          sealedEntry({
            authorizationRevision: 0,
            generation: 0,
            identityId,
            publisher: owner,
            recipient: owner,
          }),
        ],
        generation: 0,
        identityId,
        publisher: owner,
      }),
    ).toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('rejects an oversized or malformed sealed secret', async () => {
    const { identityId, owner } = await singleDeviceFixture();
    const oversized = 'a'.repeat(DeviceSealedSecretBundle.MAX_SEALED_SECRET_LENGTH + 1);
    const malformed = 'bad secret!';

    for (const sealedSecret of [oversized, malformed]) {
      expect(() =>
        bundleOf({
          entries: [
            sealedEntry({
              authorizationRevision: 0,
              generation: 1,
              identityId,
              publisher: owner,
              recipient: owner,
              sealedSecret,
            }),
          ],
          identityId,
          publisher: owner,
        }),
      ).toThrow(InvalidDeviceSealedSecretBundleError);
    }
  });
});
