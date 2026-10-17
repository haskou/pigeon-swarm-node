import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { cryptoVectors } from '../../../../support/cryptoVectors';

interface StateDigestVectors {
  invalid: { args: [unknown]; name: string }[];
  valid: { args: [Record<string, unknown>]; id: string; name: string }[];
}

const { stateDigest } = cryptoVectors<{ stateDigest: StateDigestVectors }>(
  'commitment-ids',
);

describe('public mutation state digest vectors', () => {
  it.each(stateDigest.valid)('digests $name', ({ args: [record], id }) => {
    expect(PublicMutationProof.digestOf(record)).toBe(id);
  });

  it.each(stateDigest.invalid)('refuses a $name', ({ args: [record] }) => {
    expect(() =>
      PublicMutationProof.digestOf(record as Record<string, unknown>),
    ).toThrow(InvalidPublicMutationError);
  });

  it.each([
    ['a non-finite number', { value: Number.NaN }],
    ['a class instance', { value: new Date(0) }],
  ])('refuses a record carrying %s', (_name, record) => {
    expect(() => PublicMutationProof.digestOf(record)).toThrow(
      InvalidPublicMutationError,
    );
  });

  describe('depth', () => {
    /** A record whose deepest value sits `depth` levels below it; the record is depth 0. */
    const nested = (depth: number): Record<string, unknown> =>
      depth === 1 ? { value: 'leaf' } : { value: nested(depth - 1) };

    it.each([63, 64])('digests a payload %i levels deep', (depth) => {
      expect(PublicMutationProof.digestOf(nested(depth))).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );
    });

    it.each([65, 66])('refuses a payload %i levels deep', (depth) => {
      expect(() => PublicMutationProof.digestOf(nested(depth))).toThrow(
        InvalidPublicMutationError,
      );
    });
  });
});
