import { InvalidNodeBlockListError } from '@app/contexts/nodes/domain/errors/InvalidNodeBlockListError';
import { InvalidNodeBlockListVersionError } from '@app/contexts/nodes/domain/errors/InvalidNodeBlockListVersionError';
import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
  NodeBlockListMother,
} from '../../../mothers/NodeBlockListMother';

describe('NodeBlockList', () => {
  let owner: KeyPair;

  beforeAll(async () => {
    owner = await KeyPair.generate();
  });

  it('should verify a list signed by its owner and block what it lists', async () => {
    const blocked = await NodeBlockListMother.identityId();
    const other = await NodeBlockListMother.identityId();
    const list = new NodeBlockListMother(owner)
      .blockingIdentities([blocked])
      .blockingNodePeers([NODE_PEER_ID_A])
      .build();

    expect(list.hasValidSignature()).toBe(true);
    expect(list.blocksIdentity(blocked)).toBe(true);
    expect(list.blocksIdentity(other)).toBe(false);
    expect(list.getBlockedNodePeerIds().map((id) => id.valueOf())).toEqual([
      NODE_PEER_ID_A,
    ]);
  });

  it('should round-trip its primitives verbatim', () => {
    const primitives = new NodeBlockListMother(owner)
      .blockingNodePeers([NODE_PEER_ID_A, NODE_PEER_ID_B])
      .withVersion(7)
      .primitives();

    expect(NodeBlockList.fromPrimitives(primitives).toPrimitives()).toEqual(
      primitives,
    );
  });

  it('should reject a signature over different content', async () => {
    const primitives = new NodeBlockListMother(owner).primitives();
    const tampered = NodeBlockList.fromPrimitives({
      ...primitives,
      blockedIdentityIds: [(await NodeBlockListMother.identityId()).valueOf()],
    });

    expect(tampered.hasValidSignature()).toBe(false);
  });

  it('should reject a list signed by another key than its owner', async () => {
    const primitives = new NodeBlockListMother(owner).primitives();
    const impostor = new NodeBlockListMother(await KeyPair.generate());

    expect(
      NodeBlockList.fromPrimitives({
        ...primitives,
        identitySignature: impostor.primitives().identitySignature,
      }).hasValidSignature(),
    ).toBe(false);
  });

  it('should reject another document type', () => {
    expect(() =>
      NodeBlockList.fromPrimitives({
        ...new NodeBlockListMother(owner).primitives(),
        type: 'pigeon-node-allow-list',
      }),
    ).toThrow(InvalidNodeBlockListError);
  });

  it('should reject unsorted or repeated entries', () => {
    const primitives = new NodeBlockListMother(owner).primitives();

    expect(() =>
      NodeBlockList.fromPrimitives({
        ...primitives,
        blockedNodePeerIds: [NODE_PEER_ID_B, NODE_PEER_ID_A],
      }),
    ).toThrow(InvalidNodeBlockListError);
    expect(() =>
      NodeBlockList.fromPrimitives({
        ...primitives,
        blockedNodePeerIds: [NODE_PEER_ID_A, NODE_PEER_ID_A],
      }),
    ).toThrow(InvalidNodeBlockListError);
  });

  it('should reject an identity id that is not in its canonical form', async () => {
    const identityId = await NodeBlockListMother.identityId();

    expect(() =>
      NodeBlockList.fromPrimitives({
        ...new NodeBlockListMother(owner).primitives(),
        blockedIdentityIds: [identityId.toString()],
      }),
    ).toThrow(InvalidNodeBlockListError);
  });

  it('should reject a version below one', () => {
    expect(() =>
      NodeBlockList.fromPrimitives({
        ...new NodeBlockListMother(owner).primitives(),
        version: 0,
      }),
    ).toThrow(InvalidNodeBlockListVersionError);
  });

  it('should only accept a replacement with a higher version', () => {
    const current = new NodeBlockListMother(owner).withVersion(3).build();

    expect(
      current.acceptsReplacement(
        new NodeBlockListMother(owner).withVersion(4).build(),
      ),
    ).toBe(true);
    expect(
      current.acceptsReplacement(
        new NodeBlockListMother(owner).withVersion(3).build(),
      ),
    ).toBe(false);
    expect(new NoNodeBlocks().acceptsReplacement()).toBe(true);
  });
});
