import { MailboxCreationProof } from '@app/contexts/mailboxes/domain/MailboxCreationProof';
import { leadingZeroBits } from '@app/contexts/shared/domain/proof-of-work/LeadingZeroBits';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Vectors = Record<
  'accepted' | 'rejected',
  {
    derived: { digestHex: string; leadingZeroBits: number; preimage: string };
    input: {
      difficultyBits: number;
      mailboxId: string;
      nonce: string;
      postTokenHash: string;
      readTokenHash: string;
    };
    name: string;
  }[]
>;

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../fixtures/mailbox-creation-proof-vectors.json'),
    'utf8',
  ),
) as Vectors;

const all = [...vectors.accepted, ...vectors.rejected];

describe('Mailbox creation proof vectors', () => {
  it.each(all)('pins the digest of $name', ({ derived }) => {
    const digest = createHash('sha256').update(derived.preimage).digest();

    expect(digest.toString('hex')).toBe(derived.digestHex);
    expect(leadingZeroBits(digest)).toBe(derived.leadingZeroBits);
  });

  it.each(all)('binds the preimage fields of $name', ({ derived, input }) => {
    expect(
      new MailboxCreationProof(
        input.mailboxId,
        input.postTokenHash,
        input.readTokenHash,
      ).isValid(input.nonce, derived.leadingZeroBits),
    ).toBe(input.nonce.length > 0 && input.nonce.length <= 64);
  });

  it.each(vectors.rejected)('rejects $name', ({ input }) => {
    expect(
      new MailboxCreationProof(
        input.mailboxId,
        input.postTokenHash,
        input.readTokenHash,
      ).isValid(input.nonce, input.difficultyBits),
    ).toBe(false);
  });
});
