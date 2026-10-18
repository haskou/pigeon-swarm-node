import { MailboxCreationProof } from '@app/contexts/mailboxes/domain/MailboxCreationProof';

import { proofOfWorkVectors } from '../../../support/proofOfWorkVectors';

const vectors = proofOfWorkVectors.mailboxCreation;

describe('Mailbox creation proof library vectors', () => {
  it.each(vectors.accepted)(
    'accepts $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new MailboxCreationProof(
          challenge.mailboxId,
          challenge.postTokenHash,
          challenge.readTokenHash,
        ).isValid(nonce as string, difficultyBits),
      ).toBe(true);
    },
  );

  it.each(vectors.accepted.filter(({ minted }) => minted))(
    'mints the library nonce for $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new MailboxCreationProof(
          challenge.mailboxId,
          challenge.postTokenHash,
          challenge.readTokenHash,
        ).mine(difficultyBits),
      ).toBe(nonce);
    },
  );

  it.each(vectors.rejected)(
    'rejects $name',
    ({ challenge, difficultyBits, nonce }) => {
      expect(
        new MailboxCreationProof(
          challenge.mailboxId,
          challenge.postTokenHash,
          challenge.readTokenHash,
        ).isValid(nonce as string, difficultyBits),
      ).toBe(false);
    },
  );

  it.each(vectors.invalidChallenges)(
    'refuses to prove $name',
    ({ challenge }) => {
      expect(
        new MailboxCreationProof(
          challenge.mailboxId as string,
          challenge.postTokenHash as string,
          challenge.readTokenHash as string,
        ).isValid('0', 1),
      ).toBe(false);
    },
  );

  it('rejects proofs minted under the retired v1 encoding', () => {
    const { mailboxId, postTokenHash, readTokenHash } =
      vectors.accepted[0].challenge;
    const proof = new MailboxCreationProof(
      mailboxId,
      postTokenHash,
      readTokenHash,
    );

    // v1 nonce for this challenge, valid at 16 bits under the old
    // `pigeon-mailbox-creation:v1:<id>:<post>:<read>:<nonce>` preimage.
    expect(proof.isValid('110571', 16)).toBe(false);
    // v1 accepted any 1-64 character string as a nonce.
    expect(proof.isValid('a_b-c', 1)).toBe(false);
  });
});
