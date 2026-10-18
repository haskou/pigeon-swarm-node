import { NodeBlockSourceEntriesApproverMessage } from '@app/contexts/nodes/application/approve-block-source-entries/messages/NodeBlockSourceEntriesApproverMessage';
import NodeBlockSourceEntriesApprover from '@app/contexts/nodes/application/approve-block-source-entries/NodeBlockSourceEntriesApprover';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import { InvalidNodeBlockSourceApprovalError } from '@app/contexts/nodes/domain/errors/InvalidNodeBlockSourceApprovalError';
import { NodeBlockSourceVersionHasChangedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceVersionHasChangedError';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  NODE_PEER_ID_A,
  NodeBlockListMother,
} from '../../../../mothers/NodeBlockListMother';

describe('NodeBlockSourceEntriesApprover', () => {
  let publisher: KeyPair;
  let a: IdentityId;
  let b: IdentityId;
  let source: NodeBlockSource;
  let repository: MockProxy<NodeBlockSourceRepository>;
  let policy: MockProxy<NodeBlockPolicy>;
  let approver: NodeBlockSourceEntriesApprover;

  const message = (
    params: Partial<{
      all: boolean;
      blockedIdentityIds: string[];
      blockedNodePeerIds: string[];
      version: number;
    }>,
  ): NodeBlockSourceEntriesApproverMessage =>
    new NodeBlockSourceEntriesApproverMessage({
      all: false,
      blockedIdentityIds: [],
      blockedNodePeerIds: [],
      ownerIdentityId: publisher.toPrimitives().publicKey,
      authenticatedIdentityId: publisher.toPrimitives().publicKey,
      version: 4,
      ...params,
    });

  beforeAll(async () => {
    publisher = await KeyPair.generate();
    a = await NodeBlockListMother.identityId();
    b = await NodeBlockListMother.identityId();
  });

  beforeEach(() => {
    source = NodeBlockSource.adopt(
      new IdentityId(publisher.toPrimitives().publicKey),
      new NodeBlockSourceOrigin('https://publisher.example'),
      false,
      new NodeBlockSourceVersionFloor(0),
    );
    source.receive(
      new NodeBlockListMother(publisher)
        .withVersion(4)
        .blockingIdentities([a, b])
        .blockingNodePeers([NODE_PEER_ID_A])
        .signed(),
      new Timestamp(1),
    );
    repository = mock<NodeBlockSourceRepository>();
    repository.find.mockResolvedValue(source);
    policy = mock<NodeBlockPolicy>();
    const ownerWrites = mock<NodeOwnerWriteHolder>();

    ownerWrites.hold.mockImplementation(async (_message, write) => write());
    approver = new NodeBlockSourceEntriesApprover(
      repository,
      policy,
      ownerWrites,
    );
  });

  it('should approve every pending entry of the reviewed version through the policy', async () => {
    const approved = await approver.approve(message({ all: true }));

    expect(policy.reapply).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(source);
    expect(approved.applied().count()).toBe(3);
    expect(approved.pending().count()).toBe(0);
  });

  it('should approve the chosen entries only', async () => {
    const approved = await approver.approve(
      message({
        blockedIdentityIds: [a.valueOf()],
        blockedNodePeerIds: [NODE_PEER_ID_A],
      }),
    );

    expect(approved.applied().toPrimitives()).toEqual({
      identityIds: [a.valueOf()],
      nodePeerIds: [NODE_PEER_ID_A],
    });
    expect(approved.pending().toPrimitives().identityIds).toEqual([
      b.valueOf(),
    ]);
  });

  it('should refuse approving everything of a version the owner did not review, applying nothing', async () => {
    await expect(
      approver.approve(message({ all: true, version: 3 })),
    ).rejects.toThrow(NodeBlockSourceVersionHasChangedError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(source.applied().count()).toBe(0);
  });

  it('should refuse approving chosen entries of a version the owner did not review, applying nothing', async () => {
    await expect(
      approver.approve(
        message({ blockedIdentityIds: [a.valueOf()], version: 5 }),
      ),
    ).rejects.toThrow(NodeBlockSourceVersionHasChangedError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(source.applied().count()).toBe(0);
  });

  it('should require either all entries or chosen ones, never both or neither', () => {
    expect(() => message({})).toThrow(InvalidNodeBlockSourceApprovalError);
    expect(() =>
      message({ all: true, blockedIdentityIds: [a.valueOf()] }),
    ).toThrow(InvalidNodeBlockSourceApprovalError);
  });
});
