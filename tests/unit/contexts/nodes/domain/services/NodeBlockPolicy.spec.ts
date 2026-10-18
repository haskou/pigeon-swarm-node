import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import NodeBlockExceptionsRepository from '@app/contexts/nodes/domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockEnforcer from '@app/contexts/nodes/domain/services/NodeBlockEnforcer';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';
import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
  NodeBlockListMother,
} from '../../../../mothers/NodeBlockListMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeBlockPolicy', () => {
  let repository: MockProxy<NodeBlockListRepository>;
  let sources: MockProxy<NodeBlockSourceRepository>;
  let exceptions: MockProxy<NodeBlockExceptionsRepository>;
  let loader: MockProxy<NodeLoaderService>;
  let enforcer: MockProxy<NodeBlockEnforcer>;
  let policy: NodeBlockPolicy;
  let owner: KeyPair;
  let ownerId: IdentityId;
  let blocked: IdentityId;

  const ids = (identityIds: IdentityId[]): string[] =>
    identityIds.map((identityId) => identityId.valueOf());

  const adoptedSource = async (
    publisher: KeyPair,
    identityIds: IdentityId[],
    nodePeerIds: string[],
  ): Promise<NodeBlockSource> => {
    const mother = new NodeBlockListMother(publisher)
      .blockingIdentities(identityIds)
      .blockingNodePeers(nodePeerIds);
    const source = NodeBlockSource.adopt(
      mother.ownerIdentityId(),
      new NodeBlockSourceOrigin('https://publisher.example'),
      true,
      new NodeBlockSourceVersionFloor(0),
    );

    source.receive(mother.signed(), Timestamp.now());

    return source;
  };

  beforeAll(async () => {
    owner = await KeyPair.generate();
    ownerId = new IdentityId(owner.toPrimitives().publicKey);
    blocked = await NodeBlockListMother.identityId();
  });

  beforeEach(() => {
    repository = mock<NodeBlockListRepository>();
    loader = mock<NodeLoaderService>();
    enforcer = mock<NodeBlockEnforcer>();
    sources = mock<NodeBlockSourceRepository>();
    exceptions = mock<NodeBlockExceptionsRepository>();
    policy = new NodeBlockPolicy(
      repository,
      sources,
      exceptions,
      loader,
      enforcer,
    );
    sources.findAll.mockResolvedValue([]);
    exceptions.find.mockResolvedValue(NodeBlockEntries.none());
    repository.findLocal.mockResolvedValue(
      new NodeBlockListMother(owner)
        .blockingIdentities([blocked, ownerId])
        .blockingNodePeers([NODE_PEER_ID_A])
        .build(),
    );
  });

  it('should block a listed identity on a claimed node', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
    await expect(
      policy.isIdentityBlocked(await NodeBlockListMother.identityId()),
    ).resolves.toBe(false);
  });

  it('should never block the current owner, even if listed', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await expect(policy.isIdentityBlocked(ownerId)).resolves.toBe(false);
  });

  it('should keep blocks of a previous owner after the owner changes', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother()
        .withOwner(await NodeBlockListMother.identityId())
        .build(),
    );

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
  });

  it('should block nobody while the node is unclaimed', async () => {
    loader.loadNode.mockResolvedValue(new NodeMother().build());

    await policy.load();

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(false);
    expect(enforcer.enforce).toHaveBeenCalledWith([], []);
  });

  it('should enforce the stored list without the owner on load', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await policy.load();

    const [identityIds, peerIds] = enforcer.enforce.mock.calls[0];

    expect(ids(identityIds)).toEqual([blocked.valueOf()]);
    expect(peerIds.map((peerId) => peerId.valueOf())).toEqual([NODE_PEER_ID_A]);
  });

  it('should never enforce a non-canonical identity id the own list or a stored approval names', async () => {
    const listed = await NodeBlockListMother.identityId();
    const approved = await NodeBlockListMother.identityId();
    const publisher = await KeyPair.generate();
    const source = await adoptedSource(publisher, [approved], []);

    repository.findLocal.mockResolvedValue(
      new NodeBlockListMother(owner)
        .blockingIdentities([blocked, IdentityIdMother.aliasPrefix(listed)])
        .build(),
    );
    sources.findAll.mockResolvedValue([
      NodeBlockSource.fromPrimitives({
        ...source.toPrimitives(),
        approved: {
          identityIds: [
            approved.valueOf(),
            IdentityIdMother.reencoded(approved).valueOf(),
          ],
          nodePeerIds: [],
        },
      }),
    ]);
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await policy.load();

    const [identityIds] = enforcer.enforce.mock.calls[0];

    expect(ids(identityIds).sort()).toEqual(
      [blocked.valueOf(), approved.valueOf()].sort(),
    );
  });

  it('should load the stored list once', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await policy.isIdentityBlocked(blocked);
    await policy.isIdentityBlocked(blocked);

    expect(repository.findLocal).toHaveBeenCalledTimes(1);
  });

  it('should enforce a stored change once reapplied', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());
    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(false);

    repository.findLocal.mockResolvedValue(
      new NodeBlockListMother(owner).blockingIdentities([blocked]).build(),
    );
    await policy.reapply();

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
    expect(ids(enforcer.enforce.mock.calls[0][0])).toEqual([blocked.valueOf()]);
  });

  it('should enforce the last stored change after interleaved reapplies', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    repository.findLocal.mockResolvedValue(
      new NodeBlockListMother(owner).blockingIdentities([blocked]).build(),
    );
    const first = policy.reapply();

    repository.findLocal.mockResolvedValue(new NoNodeBlocks());
    const second = policy.reapply();
    await Promise.all([first, second]);

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(false);
    expect(enforcer.enforce).toHaveBeenLastCalledWith([], []);
  });

  it('should run reapplies one at a time', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    const first = Promise.withResolvers<void>();
    repository.findLocal.mockImplementationOnce(async () => {
      await first.promise;

      return new NoNodeBlocks();
    });
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());

    const firstReapply = policy.reapply();
    const secondReapply = policy.reapply();
    await Promise.resolve();
    expect(repository.findLocal).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.all([firstReapply, secondReapply]);
    expect(repository.findLocal).toHaveBeenCalledTimes(2);
  });

  it('should keep reapplying after one fails', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    repository.findLocal.mockRejectedValueOnce(new Error('refused'));
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());

    await expect(policy.reapply()).rejects.toThrow('refused');
    await expect(policy.reapply()).resolves.toBeUndefined();
  });

  it('should block what adopted sources apply on top of the own list', async () => {
    const adopted = await NodeBlockListMother.identityId();

    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    sources.findAll.mockResolvedValue([
      await adoptedSource(
        await KeyPair.generate(),
        [adopted],
        [NODE_PEER_ID_B],
      ),
    ]);

    await policy.load();

    const [identityIds, peerIds] = enforcer.enforce.mock.calls[0];

    expect(ids(identityIds).sort()).toEqual(
      [adopted.valueOf(), blocked.valueOf()].sort(),
    );
    expect(peerIds.map((peerId) => peerId.valueOf()).sort()).toEqual(
      [NODE_PEER_ID_A, NODE_PEER_ID_B].sort(),
    );
    await expect(policy.isIdentityBlocked(adopted)).resolves.toBe(true);
  });

  it('should never let adopted sources block local exceptions or the owner', async () => {
    const excepted = await NodeBlockListMother.identityId();

    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());
    sources.findAll.mockResolvedValue([
      await adoptedSource(
        await KeyPair.generate(),
        [excepted, ownerId],
        [NODE_PEER_ID_B],
      ),
    ]);
    exceptions.find.mockResolvedValue(
      new NodeBlockEntries([excepted], [new NodePeerId(NODE_PEER_ID_B)]),
    );

    await policy.load();

    expect(enforcer.enforce).toHaveBeenCalledWith([], []);
    await expect(policy.isIdentityBlocked(excepted)).resolves.toBe(false);
    await expect(policy.isIdentityBlocked(ownerId)).resolves.toBe(false);
  });

  it('should keep blocking an exception the owner listed in the own list', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    exceptions.find.mockResolvedValue(new NodeBlockEntries([blocked], []));

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
  });

  it('should lift the block of a listed identity that becomes owner', async () => {
    await policy.ownerChanged(new NodeMother().withOwner(blocked).build());

    expect(ids(enforcer.enforce.mock.calls[0][0])).toEqual([ownerId.valueOf()]);
  });

  it('should retry loading after a failed load', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );
    repository.findLocal.mockRejectedValueOnce(new Error('database closed'));

    await expect(policy.isIdentityBlocked(blocked)).rejects.toThrow(
      'database closed',
    );
    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
  });
});
