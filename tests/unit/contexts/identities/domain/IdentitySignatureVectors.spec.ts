import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair, PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Vectors = {
  cases: {
    derived: { signature: string; signingPayload: string };
    input: Omit<IdentityPrimitives, 'signature'>;
    name: string;
    signer: 'device' | 'identity' | 'recovery';
  }[];
  identities: {
    accepted: { name: string; primitives: IdentityPrimitives }[];
    rejected: {
      name: string;
      primitives: IdentityPrimitives;
      signedPayload: string;
      signer: 'device' | 'identity' | 'recovery';
    }[];
  };
  keys: Record<
    'device' | 'identity' | 'recovery',
    {
      identityId: string;
      privateKeyPem: string;
      publicKeyPem: string;
      seedHex: string;
    }
  >;
};

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/identity-signature.json'),
    'utf8',
  ),
) as Vectors;

const SIGNING_FIELDS = [
  'admissionNonce',
  'authorizationRevision',
  'deviceCredential',
  'deviceCredentialCommitment',
  'id',
  'mailboxHome',
  'networks',
  'previousIdentityExternalIdentifier',
  'profile',
  'recoveryAuthority',
  'timestamp',
  'version',
];

describe('Identity self-signature vectors', () => {
  describe('signingPayload', () => {
    it.each(vectors.cases)('pins the bytes of $name', ({ derived, input }) => {
      expect(
        new IdentitySignatureDomainService().getCanonicalSigningContent(
          IdentitySignaturePayload.fromPrimitives(input as IdentityPrimitives),
        ),
      ).toBe(derived.signingPayload);
    });

    it('keeps the pinned preimage keys in alphabetical order', () => {
      for (const { derived } of vectors.cases) {
        const keys = Object.keys(
          JSON.parse(
            derived.signingPayload.replace('pigeon:identity:v1\n', ''),
          ),
        );

        expect(keys).toEqual(
          SIGNING_FIELDS.filter((field) => keys.includes(field)),
        );
      }
    });
  });

  describe('signature', () => {
    it.each(vectors.cases)(
      'signs $name deterministically and verifies',
      ({ derived, signer }) => {
        const key = vectors.keys[signer];

        expect(
          KeyPair.fromPrimitives({
            privateKey: key.privateKeyPem,
            publicKey: key.publicKeyPem,
          })
            .sign(derived.signingPayload)
            .valueOf(),
        ).toBe(derived.signature);
        expect(
          new PublicKey(key.publicKeyPem).isValidSignature(
            derived.signingPayload,
            new Signature(derived.signature),
          ),
        ).toBe(true);
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
            .update(`pigeon-vector:identity-signature:${role}`, 'utf8')
            .digest('hex'),
        );
      },
    );

    it.each(vectors.cases)(
      'commits the device credential of $name the way the domain does',
      ({ input }) => {
        expect(
          DeviceCredential.fromString(input.deviceCredential)
            .getCommitment()
            .valueOf(),
        ).toBe(input.deviceCredentialCommitment);
      },
    );
  });

  describe('identity', () => {
    it.each(vectors.identities.accepted)(
      'accepts $name and reproduces the pinned preimage',
      ({ primitives }) => {
        const identity = Identity.fromPrimitives(primitives);

        expect(
          new IdentitySignatureDomainService().getCanonicalSigningContent(
            IdentitySignaturePayload.fromPrimitives(identity.toPrimitives()),
          ),
        ).toBe(
          vectors.cases.find(
            ({ derived }) => derived.signature === primitives.signature,
          )?.derived.signingPayload,
        );
      },
    );

    it.each(vectors.identities.rejected)(
      'rejects $name',
      ({ primitives, signedPayload, signer }) => {
        // The signature is genuine over signedPayload, so the rejection is
        // caused by a preimage that differs from the contract.
        expect(
          new PublicKey(vectors.keys[signer].publicKeyPem).isValidSignature(
            signedPayload,
            new Signature(primitives.signature),
          ),
        ).toBe(true);
        expect(() => Identity.fromPrimitives(primitives)).toThrow(
          InvalidIdentitySignatureError,
        );
      },
    );
  });
});
