import { NodeBlockSourceAdopterMessage } from '@app/contexts/nodes/application/adopt-block-source/messages/NodeBlockSourceAdopterMessage';
import NodeBlockSourceAdopter from '@app/contexts/nodes/application/adopt-block-source/NodeBlockSourceAdopter';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('NodeBlockSourceAdopter', () => {
  let publisher: KeyPair;
  let repository: MockProxy<NodeBlockSourceRepository>;
  let policy: MockProxy<NodeBlockPolicy>;
  let ownerWrites: MockProxy<NodeOwnerWriteHolder>;
  let adopter: NodeBlockSourceAdopter;

  beforeAll(async () => {
    publisher = await KeyPair.generate();
  });

  beforeEach(() => {
    repository = mock<NodeBlockSourceRepository>();
    repository.exists.mockResolvedValue(false);
    repository.versionFloor.mockResolvedValue(
      new NodeBlockSourceVersionFloor(5),
    );
    policy = mock<NodeBlockPolicy>();
    ownerWrites = mock<NodeOwnerWriteHolder>();

    ownerWrites.hold.mockImplementation(async (_message, write) => write());
    adopter = new NodeBlockSourceAdopter(repository, policy, ownerWrites);
  });

  it('should not accept again a list older than one accepted before the publisher was removed', async () => {
    const owner = new NodeBlockListMother(publisher).ownerIdentityId();
    const adopted = await adopter.adopt(
      new NodeBlockSourceAdopterMessage(
        owner.valueOf(),
        'https://publisher.example',
        true,
        owner.valueOf(),
      ),
    );

    expect(repository.versionFloor).toHaveBeenCalledWith(owner);
    expect(
      adopted.receive(
        new NodeBlockListMother(publisher).withVersion(5).signed(),
        new Timestamp(1),
      ),
    ).toEqual(NodeBlockSourceFetchOutcome.NOT_NEWER);
    expect(
      adopted.receive(
        new NodeBlockListMother(publisher).withVersion(6).signed(),
        new Timestamp(2),
      ),
    ).toEqual(NodeBlockSourceFetchOutcome.ACCEPTED);
  });

  it('should hold the write under the authenticated owner id', async () => {
    const publisherId = await NodeBlockListMother.identityId();
    const nodeOwnerId = await NodeBlockListMother.identityId();

    await adopter.adopt(
      new NodeBlockSourceAdopterMessage(
        publisherId.valueOf(),
        'https://publisher.example',
        true,
        nodeOwnerId.valueOf(),
      ),
    );

    expect(ownerWrites.hold).toHaveBeenCalledWith(
      new NodeOwnerWriteHolderMessage(nodeOwnerId.valueOf()),
      expect.any(Function),
    );
  });

  it('should save nothing and reapply nothing when the hold refuses', async () => {
    ownerWrites.hold.mockRejectedValue(new Error('refused'));

    await expect(
      adopter.adopt(
        new NodeBlockSourceAdopterMessage(
          publisher.toPrimitives().publicKey,
          'https://publisher.example',
          true,
          publisher.toPrimitives().publicKey,
        ),
      ),
    ).rejects.toThrow('refused');
    expect(repository.save).not.toHaveBeenCalled();
    expect(policy.reapply).not.toHaveBeenCalled();
  });

  it('should reapply only after the save and the hold release', async () => {
    const order: string[] = [];

    repository.save.mockImplementation(async () => {
      order.push('saved');
    });
    ownerWrites.hold.mockImplementation(async (_message, write) => {
      const result = await write();

      order.push('released');

      return result;
    });
    policy.reapply.mockImplementation(async () => {
      order.push('reapplied');
    });

    await adopter.adopt(
      new NodeBlockSourceAdopterMessage(
        publisher.toPrimitives().publicKey,
        'https://publisher.example',
        true,
        publisher.toPrimitives().publicKey,
      ),
    );

    expect(order).toEqual(['saved', 'released', 'reapplied']);
  });
});
