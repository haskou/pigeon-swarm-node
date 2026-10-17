import { CommunityOperationAncestry } from '@app/contexts/communities/domain/operations/CommunityOperationAncestry';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';

import {
  alice,
  bob,
  genesis,
  join,
  mallory,
} from './CommunityOperationFixtures';

describe('CommunityOperationAncestry', () => {
  const created = genesis();
  const left = join([created], alice);
  const right = join([created], bob);
  const merged = join([left, right], mallory);
  const ancestry = new CommunityOperationAncestry(
    CommunityStateFold.orderOf([merged, right, left, created]),
  );

  it('finds the ancestors of an operation through every parent', () => {
    expect(ancestry.isAncestor(created.getHash(), merged.getHash())).toBe(true);
    expect(ancestry.isAncestor(right.getHash(), merged.getHash())).toBe(true);
    expect(ancestry.isAncestor(merged.getHash(), created.getHash())).toBe(
      false,
    );
    expect(ancestry.isAncestor(left.getHash(), left.getHash())).toBe(false);
  });

  it('knows nothing of an operation outside the set', () => {
    expect(ancestry.isAncestor('unknown', merged.getHash())).toBe(false);
    expect(ancestry.isAncestor(created.getHash(), 'unknown')).toBe(false);
  });

  it('tells concurrent branches apart from causal order', () => {
    expect(ancestry.areConcurrent(left.getHash(), right.getHash())).toBe(true);
    expect(ancestry.areConcurrent(left.getHash(), merged.getHash())).toBe(
      false,
    );
    expect(ancestry.areConcurrent(left.getHash(), left.getHash())).toBe(false);
  });

  it('collects the union of the closures, without the operations themselves', () => {
    expect(ancestry.closureOf([left.getHash(), right.getHash()])).toEqual(
      new Set([created.getHash()]),
    );
    expect(ancestry.closureOf([merged.getHash()])).toEqual(
      new Set([created.getHash(), left.getHash(), right.getHash()]),
    );
  });
});
