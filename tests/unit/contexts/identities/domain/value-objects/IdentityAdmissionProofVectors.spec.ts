import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';
import { leadingZeroBits } from '@app/contexts/shared/domain/proof-of-work/LeadingZeroBits';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Vectors = Record<
  'accepted' | 'rejected',
  {
    derived: { digestHex: string; leadingZeroBits: number; preimage: string };
    input: { identityId: string; networkIds: string[]; nonce: string };
    name: string;
  }[]
> & { difficultyBits: number };

const vectors = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../../fixtures/identity-admission-proof-vectors.json',
    ),
    'utf8',
  ),
) as Vectors;

const all = [...vectors.accepted, ...vectors.rejected];

describe('Identity admission proof vectors', () => {
  it('pins the protocol difficulty', () => {
    expect(IdentityAdmissionProof.DIFFICULTY_BITS).toBe(vectors.difficultyBits);
  });

  it.each(all)('pins the digest of $name', ({ derived }) => {
    const digest = createHash('sha256').update(derived.preimage).digest();

    expect(digest.toString('hex')).toBe(derived.digestHex);
    expect(leadingZeroBits(digest)).toBe(derived.leadingZeroBits);
  });

  it.each(all)('binds the preimage fields of $name', ({ derived, input }) => {
    expect(
      new IdentityAdmissionProof(input.identityId, input.networkIds).isValid(
        input.nonce,
        derived.leadingZeroBits,
      ),
    ).toBe(input.nonce.length > 0);
  });

  it.each(vectors.rejected)('rejects $name', ({ input }) => {
    expect(
      new IdentityAdmissionProof(input.identityId, input.networkIds).isValid(
        input.nonce,
      ),
    ).toBe(false);
  });
});
