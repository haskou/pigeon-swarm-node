import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import {
  DeviceSealedSecretBundle,
  DeviceSealedSecretBundlePrimitives,
} from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { InvalidDeviceSealedSecretSignatureError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretSignatureError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair, PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type KeyRole = 'candidate' | 'identity' | 'owner' | 'recovery';

interface VectorKey {
  identityId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  seedHex: string;
}

interface VectorCase {
  derived: { signature: string; signingPayload: string };
  input: {
    authorizationRevision: number;
    generation: number;
    identityId: string;
    publisherCredential: string;
    recipientCredential: string;
    sealedSecret: string;
  };
  name: string;
  signer: KeyRole;
}

interface VectorNormalization {
  input: string;
  name: string;
  normalized: string;
}

interface Vectors {
  bundle: {
    accepted: {
      name: string;
      normalized: DeviceSealedSecretBundlePrimitives;
      primitives: DeviceSealedSecretBundlePrimitives;
    };
    rejected: {
      name: string;
      primitives: DeviceSealedSecretBundlePrimitives;
      signedPayload: string;
    }[];
  };
  cases: VectorCase[];
  keys: Record<KeyRole, VectorKey>;
  networkId: string;
  normalization: VectorNormalization[];
}

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/device-sealed-secret.json'),
    'utf8',
  ),
) as Vectors;

const SIGNING_FIELDS = [
  'authorizationRevision',
  'generation',
  'identityId',
  'publisherCredential',
  'purpose',
  'recipientCredential',
  'sealedSecret',
];

function keyPairOf(key: VectorKey): KeyPair {
  return KeyPair.fromPrimitives({
    privateKey: key.privateKeyPem,
    publicKey: key.publicKeyPem,
  });
}

function verifies(
  publicKeyPem: string,
  payload: string,
  signature: string,
): boolean {
  return new PublicKey(publicKeyPem).isValidSignature(
    payload,
    new Signature(signature),
  );
}

function genesisAuthorization(): DeviceAuthorization {
  return DeviceAuthorization.genesis(
    new IdentityId(vectors.keys.identity.publicKeyPem),
    [new NetworkId(vectors.networkId)],
    DeviceCredential.fromString(vectors.keys.owner.publicKeyPem),
    RecoveryAuthority.fromString(vectors.keys.recovery.publicKeyPem),
  );
}

describe('DeviceSealedSecretBundle signing vectors', () => {
  describe('signingPayload', () => {
    it.each(vectors.cases)('pins the bytes of $name', ({ derived, input }) => {
      expect(DeviceSealedSecretBundle.signingPayload(input)).toBe(
        derived.signingPayload,
      );
    });

    it('keeps the pinned preimage keys in alphabetical order', () => {
      for (const { derived } of vectors.cases) {
        expect(Object.keys(JSON.parse(derived.signingPayload))).toEqual(
          SIGNING_FIELDS,
        );
      }
    });
  });

  describe('signature', () => {
    it.each(vectors.cases)(
      'signs $name deterministically and verifies',
      ({ derived, signer }) => {
        const key = vectors.keys[signer];

        expect(keyPairOf(key).sign(derived.signingPayload).valueOf()).toBe(
          derived.signature,
        );
        expect(
          verifies(key.publicKeyPem, derived.signingPayload, derived.signature),
        ).toBe(true);
      },
    );
  });

  describe('credential normalization', () => {
    it.each(vectors.normalization)(
      'normalizes $name to body-only base64 SPKI',
      ({ input, normalized }) => {
        expect(new IdentityId(input).valueOf()).toBe(normalized);
      },
    );
  });

  describe('fixture keys', () => {
    it.each(Object.entries(vectors.keys))(
      'derives %s as documented',
      (role, key) => {
        expect(new IdentityId(key.publicKeyPem).valueOf()).toBe(key.identityId);
        expect(key.seedHex).toBe(
          createHash('sha256')
            .update(`pigeon-vector:device-sealed-secret:${role}`, 'utf8')
            .digest('hex'),
        );
      },
    );
  });

  describe('bundle', () => {
    it('normalizes PEM-form primitives and accepts the entry sealed by the publisher', () => {
      const { accepted } = vectors.bundle;
      const bundle = DeviceSealedSecretBundle.fromPrimitives(
        accepted.primitives,
      );

      expect(bundle.toPrimitives()).toEqual(accepted.normalized);
      expect(() =>
        bundle.assertPublishableBy(genesisAuthorization()),
      ).not.toThrow();
    });

    it.each(vectors.bundle.rejected)(
      'rejects $name',
      ({ primitives, signedPayload }) => {
        expect(primitives.entries).toHaveLength(1);
        // The signatures are genuine over signedPayload, so the rejection is
        // caused by a preimage that differs from the contract.
        expect(
          primitives.entries.every(({ signature }) =>
            verifies(vectors.keys.owner.publicKeyPem, signedPayload, signature),
          ),
        ).toBe(true);
        expect(() =>
          DeviceSealedSecretBundle.fromPrimitives(
            primitives,
          ).assertPublishableBy(genesisAuthorization()),
        ).toThrow(InvalidDeviceSealedSecretSignatureError);
      },
    );
  });
});
