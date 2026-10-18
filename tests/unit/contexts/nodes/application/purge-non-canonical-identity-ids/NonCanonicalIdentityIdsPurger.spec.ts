import NonCanonicalIdentityIdsPurger from '@app/contexts/nodes/application/purge-non-canonical-identity-ids/NonCanonicalIdentityIdsPurger';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import NodeBlockExceptionsRepository from '@app/contexts/nodes/domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';
import {
  NODE_PEER_ID_A,
  NodeBlockListMother,
} from '../../../../mothers/NodeBlockListMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NonCanonicalIdentityIdsPurger', () => {
  let nodes: MockProxy<NodeRepository>;
  let exceptions: MockProxy<NodeBlockExceptionsRepository>;
  let sources: MockProxy<NodeBlockSourceRepository>;
  let blockLists: MockProxy<NodeBlockListRepository>;
  let purger: NonCanonicalIdentityIdsPurger;
  let a: IdentityId;
  let b: IdentityId;

  const adopted = async (
    approvedIdentityIds: IdentityId[],
  ): Promise<NodeBlockSource> => {
    const mother = new NodeBlockListMother(await KeyPair.generate())
      .blockingIdentities([a, IdentityIdMother.aliasPrefix(a), b])
      .blockingNodePeers([NODE_PEER_ID_A]);
    const source = NodeBlockSource.adopt(
      mother.ownerIdentityId(),
      new NodeBlockSourceOrigin('https://publisher.example'),
      false,
      new NodeBlockSourceVersionFloor(0),
    );

    source.receive(mother.signed(), Timestamp.now());

    return NodeBlockSource.fromPrimitives({
      ...source.toPrimitives(),
      approved: {
        identityIds: approvedIdentityIds.map((id) => id.valueOf()),
        nodePeerIds: [NODE_PEER_ID_A],
      },
    });
  };

  const storedNode = (owner?: IdentityId): Node =>
    Node.fromPrimitives({
      ...new NodeMother().build().toPrimitives(),
      owner: owner?.valueOf(),
    });

  beforeAll(async () => {
    a = await NodeBlockListMother.identityId();
    b = await NodeBlockListMother.identityId();
  });

  beforeEach(() => {
    nodes = mock<NodeRepository>();
    exceptions = mock<NodeBlockExceptionsRepository>();
    sources = mock<NodeBlockSourceRepository>();
    blockLists = mock<NodeBlockListRepository>();
    blockLists.findLocal.mockResolvedValue(new NoNodeBlocks());
    purger = new NonCanonicalIdentityIdsPurger(
      nodes,
      exceptions,
      sources,
      blockLists,
    );
  });

  it('should not report an owner cleared when the stored node no longer names a non-canonical one', async () => {
    const loaded = storedNode(IdentityIdMother.reencoded(a));
    const latest = storedNode(a);

    nodes.loadLocalNode.mockResolvedValue(loaded);
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(latest);

      return latest;
    });
    exceptions.find.mockResolvedValue(new NodeBlockEntries([], []));
    sources.findAll.mockResolvedValue([]);

    const purge = await purger.purge();

    expect(purge.ownerCleared).toBe(false);
    expect(latest.hasOwner()).toBe(true);
  });

  it('should clear a non-canonical owner and drop non-canonical exceptions and approvals', async () => {
    const node = storedNode(IdentityIdMother.reencoded(a));
    const source = await adopted([a, IdentityIdMother.aliasPrefix(a)]);

    nodes.loadLocalNode.mockResolvedValue(node);
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(node);

      return node;
    });
    exceptions.find.mockResolvedValue(
      new NodeBlockEntries([b, IdentityIdMother.aliasPrefix(b)], []),
    );
    sources.findAll.mockResolvedValue([source]);

    const purge = await purger.purge();

    expect(purge.ownerCleared).toBe(true);
    expect(purge.removedEntries).toBe(2);
    expect(purge.ownListNonCanonicalEntries).toBe(0);
    expect(node.hasOwner()).toBe(false);
    expect(exceptions.save.mock.calls[0][0].toPrimitives()).toEqual(
      new NodeBlockEntries([b], []).toPrimitives(),
    );
    expect(sources.save).toHaveBeenCalledWith(source);
    expect(source.applied().toPrimitives()).toEqual({
      identityIds: [a.valueOf()],
      nodePeerIds: [NODE_PEER_ID_A],
    });
  });

  it('should leave canonical data unchanged and write nothing', async () => {
    const source = await adopted([a, b]);
    const before = source.toPrimitives();

    nodes.loadLocalNode.mockResolvedValue(storedNode(a));
    exceptions.find.mockResolvedValue(new NodeBlockEntries([b], []));
    sources.findAll.mockResolvedValue([source]);

    const purge = await purger.purge();

    expect(purge.ownerCleared).toBe(false);
    expect(purge.removedEntries).toBe(0);
    expect(purge.ownListNonCanonicalEntries).toBe(0);
    expect(nodes.updateLocalNode).not.toHaveBeenCalled();
    expect(exceptions.save).not.toHaveBeenCalled();
    expect(sources.save).not.toHaveBeenCalled();
    expect(blockLists.saveLocal).not.toHaveBeenCalled();
    expect(source.toPrimitives()).toEqual(before);
  });

  it('should leave an unclaimed node unclaimed without writing it', async () => {
    nodes.loadLocalNode.mockResolvedValue(storedNode());
    exceptions.find.mockResolvedValue(NodeBlockEntries.none());
    sources.findAll.mockResolvedValue([]);

    const purge = await purger.purge();

    expect(purge.ownerCleared).toBe(false);
    expect(nodes.updateLocalNode).not.toHaveBeenCalled();
  });

  it('should count, but keep, its own stored list when it names an alias', async () => {
    const mother = new NodeBlockListMother(
      await KeyPair.generate(),
    ).blockingIdentities([a, IdentityIdMother.aliasPrefix(a), b]);

    blockLists.findLocal.mockResolvedValue(mother.build());
    nodes.loadLocalNode.mockResolvedValue(storedNode(a));
    exceptions.find.mockResolvedValue(NodeBlockEntries.none());
    sources.findAll.mockResolvedValue([]);

    const purge = await purger.purge();

    expect(purge.ownListNonCanonicalEntries).toBe(1);
    expect(purge.ownerCleared).toBe(false);
    expect(blockLists.saveLocal).not.toHaveBeenCalled();
    expect(nodes.updateLocalNode).not.toHaveBeenCalled();
  });
});
