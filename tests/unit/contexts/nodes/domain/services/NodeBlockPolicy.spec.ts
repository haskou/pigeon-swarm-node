import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockEnforcer from '@app/contexts/nodes/domain/services/NodeBlockEnforcer';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  NODE_PEER_ID_A,
  NodeBlockListMother,
} from '../../../../mothers/NodeBlockListMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeBlockPolicy', () => {
  let repository: MockProxy<NodeBlockListRepository>;
  let loader: MockProxy<NodeLoaderService>;
  let enforcer: MockProxy<NodeBlockEnforcer>;
  let policy: NodeBlockPolicy;
  let owner: KeyPair;
  let ownerId: IdentityId;
  let blocked: IdentityId;

  const ids = (identityIds: IdentityId[]): string[] =>
    identityIds.map((identityId) => identityId.valueOf());

  beforeAll(async () => {
    owner = await KeyPair.generate();
    ownerId = new IdentityId(owner.toPrimitives().publicKey);
    blocked = await NodeBlockListMother.identityId();
  });

  beforeEach(() => {
    repository = mock<NodeBlockListRepository>();
    loader = mock<NodeLoaderService>();
    enforcer = mock<NodeBlockEnforcer>();
    policy = new NodeBlockPolicy(repository, loader, enforcer);
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

  it('should load the stored list once', async () => {
    loader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(ownerId).build(),
    );

    await policy.isIdentityBlocked(blocked);
    await policy.isIdentityBlocked(blocked);

    expect(repository.findLocal).toHaveBeenCalledTimes(1);
  });

  it('should answer from a replaced list and enforce it', async () => {
    const node = new NodeMother().withOwner(ownerId).build();

    loader.loadNode.mockResolvedValue(node);
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());

    await policy.replace(
      new NodeBlockListMother(owner).blockingIdentities([blocked]).build(),
      node,
    );

    await expect(policy.isIdentityBlocked(blocked)).resolves.toBe(true);
    expect(repository.findLocal).not.toHaveBeenCalled();
    expect(ids(enforcer.enforce.mock.calls[0][0])).toEqual([blocked.valueOf()]);
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
