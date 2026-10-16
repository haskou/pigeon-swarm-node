import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionPrimitives } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionPrimitives';
import { PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';
import { readFileSync } from 'node:fs';

type Vectors = {
  cases: {
    expected: {
      proofOfPossessionPayload: null | string;
      signingPayload: string;
      transition: DeviceAuthorizationTransitionPrimitives;
    };
    name: string;
    signer: 'author' | 'recoveryAuthority';
  }[];
  keys: Record<
    'author' | 'recoveryAuthority' | 'target',
    { privateKeyPem: string; publicKeyPem: string }
  >;
};

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/device-authorization-transition.json'),
    'utf8',
  ),
) as Vectors;

const TRANSITION_FIELDS = [
  'authorCredential',
  'authorizedAt',
  'compromisedCredentials',
  'compromisedSince',
  'epoch',
  'identityId',
  'operation',
  'operationId',
  'pairingExpiration',
  'pairingId',
  'previousRevision',
  'revision',
  'targetCredential',
  'targetCredentialCommitment',
];

describe('Device authorization transition vectors', () => {
  it.each(vectors.cases)(
    'derives the signing payload of $name',
    ({ expected }) => {
      const transition = DeviceAuthorizationTransition.fromPrimitives(
        expected.transition,
      );
      const signed = JSON.parse(expected.signingPayload) as {
        transition: object;
      };

      expect(transition.getSigningPayload().valueOf()).toBe(
        expected.signingPayload,
      );
      expect(Object.keys(signed)).toEqual(
        expected.proofOfPossessionPayload === null
          ? ['domain', 'transition']
          : ['domain', 'proofOfPossession', 'transition'],
      );
      expect(Object.keys(signed.transition)).toEqual(
        TRANSITION_FIELDS.filter((field) => field in signed.transition),
      );
    },
  );

  it.each(vectors.cases)(
    'derives the proof-of-possession payload of $name',
    ({ expected }) => {
      const transition = DeviceAuthorizationTransition.fromPrimitives(
        expected.transition,
      );

      if (expected.proofOfPossessionPayload === null) {
        expect(transition.isRevocation()).toBe(true);
        expect(expected.transition.proofOfPossession).toBeUndefined();

        return;
      }

      expect(transition.getProofOfPossessionPayload().valueOf()).toBe(
        expected.proofOfPossessionPayload,
      );
      expect(
        transition
          .getTargetCredential()
          .isValidSignature(
            transition.getProofOfPossessionPayload(),
            transition.getProofOfPossession(),
          ),
      ).toBe(true);
    },
  );

  it.each(vectors.cases)(
    'verifies the signature of $name',
    ({ expected, signer }) => {
      const transition = DeviceAuthorizationTransition.fromPrimitives(
        expected.transition,
      );
      const signerKey = PublicKey.fromPEM(vectors.keys[signer].publicKeyPem);

      expect(
        signerKey.isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      ).toBe(true);
      expect(
        PublicKey.fromPEM(vectors.keys.target.publicKeyPem).isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      ).toBe(false);
    },
  );

  it.each(vectors.cases)(
    'round-trips the primitives of $name',
    ({ expected }) => {
      expect(
        JSON.parse(
          JSON.stringify(
            DeviceAuthorizationTransition.fromPrimitives(
              expected.transition,
            ).toPrimitives(),
          ),
        ),
      ).toEqual(expected.transition);
    },
  );

  it('rejects the transition signature replayed as a proof of possession', () => {
    const enrollment = vectors.cases.find(
      ({ expected }) => expected.transition.operation === 'enroll',
    );
    const transition = DeviceAuthorizationTransition.fromPrimitives(
      enrollment!.expected.transition,
    );

    expect(
      PublicKey.fromPEM(vectors.keys.author.publicKeyPem).isValidSignature(
        transition.getProofOfPossessionPayload(),
        new Signature(enrollment!.expected.transition.signature),
      ),
    ).toBe(false);
  });
});
