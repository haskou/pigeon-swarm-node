import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
  NodeBlockListMother,
} from '../../../mothers/NodeBlockListMother';

describe('NodeBlockEntries', () => {
  let a: IdentityId;
  let b: IdentityId;
  const peerA = new NodePeerId(NODE_PEER_ID_A);
  const peerB = new NodePeerId(NODE_PEER_ID_B);

  beforeAll(async () => {
    a = await NodeBlockListMother.identityId();
    b = await NodeBlockListMother.identityId();
  });

  it('should ignore duplicates', () => {
    const entries = new NodeBlockEntries([a, a], [peerA, peerA]);

    expect(entries.count()).toBe(2);
  });

  it('should combine, intersect and subtract sets', () => {
    const left = new NodeBlockEntries([a], [peerA]);
    const right = new NodeBlockEntries([a, b], [peerB]);

    expect(left.union(right).count()).toBe(4);
    expect(left.intersection(right).toPrimitives()).toEqual({
      identityIds: [a.valueOf()],
      nodePeerIds: [],
    });
    expect(right.without(left).toPrimitives()).toEqual({
      identityIds: [b.valueOf()],
      nodePeerIds: [NODE_PEER_ID_B],
    });
  });

  it('should tell whether it includes another set', () => {
    const all = new NodeBlockEntries([a, b], [peerA]);

    expect(all.includes(new NodeBlockEntries([b], [peerA]))).toBe(true);
    expect(all.includes(new NodeBlockEntries([], [peerB]))).toBe(false);
  });

  it('should round-trip sorted primitives', () => {
    const entries = new NodeBlockEntries([b, a], [peerB, peerA]);
    const primitives = entries.toPrimitives();

    expect(primitives.identityIds).toEqual([a.valueOf(), b.valueOf()].sort());
    expect(NodeBlockEntries.fromPrimitives(primitives).toPrimitives()).toEqual(
      primitives,
    );
  });
});
