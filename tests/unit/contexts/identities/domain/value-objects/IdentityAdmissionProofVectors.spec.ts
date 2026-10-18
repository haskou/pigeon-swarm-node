import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

import { proofOfWorkVectors } from '../../../../../support/proofOfWorkVectors';

const vectors = proofOfWorkVectors.identityAdmission;

describe('Identity admission proof library vectors', () => {
  it('keeps the protocol difficulty at the library floor vector', () => {
    expect(IdentityAdmissionProof.DIFFICULTY_BITS).toBe(16);
    expect(
      vectors.accepted.some(({ difficultyBits }) => difficultyBits === 16),
    ).toBe(true);
  });

  it.each(vectors.accepted)(
    'accepts $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new IdentityAdmissionProof(
          challenge.identityId,
          challenge.networkIds,
        ).isValid(nonce as string, difficultyBits),
      ).toBe(true);
    },
  );

  it.each(vectors.accepted.filter(({ minted }) => minted))(
    'mints the library nonce for $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new IdentityAdmissionProof(
          challenge.identityId,
          challenge.networkIds,
        ).mine(undefined, difficultyBits),
      ).toBe(nonce);
    },
  );

  it.each(vectors.rejected)(
    'rejects $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new IdentityAdmissionProof(
          challenge.identityId,
          challenge.networkIds,
        ).isValid(nonce as string, difficultyBits),
      ).toBe(false);
    },
  );

  it.each(vectors.invalidChallenges)(
    'refuses to prove $name',
    ({ challenge }) => {
      expect(
        new IdentityAdmissionProof(
          challenge.identityId as string,
          challenge.networkIds as string[],
        ).isValid('0', 1),
      ).toBe(false);
    },
  );

  it('rejects proofs minted under the retired v1 encoding', () => {
    const identityId = vectors.accepted[0].challenge.identityId;
    const networkIds = vectors.accepted[0].challenge.networkIds;

    // v1 nonces for this challenge, valid at 16 bits under the old
    // `pigeon-identity-admission:v1:<id>:<networks>:<nonce>` preimage.
    expect(
      new IdentityAdmissionProof(identityId, networkIds).isValid('2233', 16),
    ).toBe(false);
    // v1 accepted any 1-64 character string as a nonce.
    expect(
      new IdentityAdmissionProof(identityId, networkIds).isValid('a_b-c', 1),
    ).toBe(false);
  });
});
