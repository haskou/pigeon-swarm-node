import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import { NodeBlockExceptionsUpdaterMessage } from '@app/contexts/nodes/application/update-block-exceptions/messages/NodeBlockExceptionsUpdaterMessage';
import NodeBlockExceptionsUpdater from '@app/contexts/nodes/application/update-block-exceptions/NodeBlockExceptionsUpdater';
import NodeBlockExceptionsRepository from '@app/contexts/nodes/domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  NODE_PEER_ID_A,
  NodeBlockListMother,
} from '../../../../mothers/NodeBlockListMother';

describe('NodeBlockExceptionsUpdater', () => {
  let owner: KeyPair;
  let repository: MockProxy<NodeBlockExceptionsRepository>;
  let policy: MockProxy<NodeBlockPolicy>;
  let ownerWrites: MockProxy<NodeOwnerWriteHolder>;
  let updater: NodeBlockExceptionsUpdater;

  beforeAll(async () => {
    owner = await KeyPair.generate();
  });

  beforeEach(() => {
    repository = mock<NodeBlockExceptionsRepository>();
    policy = mock<NodeBlockPolicy>();
    ownerWrites = mock<NodeOwnerWriteHolder>();

    ownerWrites.hold.mockImplementation(async (_message, write) => write());
    updater = new NodeBlockExceptionsUpdater(repository, policy, ownerWrites);
  });

  const message = async (): Promise<NodeBlockExceptionsUpdaterMessage> =>
    new NodeBlockExceptionsUpdaterMessage(
      [(await NodeBlockListMother.identityId()).valueOf()],
      [NODE_PEER_ID_A],
      owner.toPrimitives().publicKey,
    );

  it('should save the exceptions under the hold for the authenticated owner', async () => {
    const updates = await message();

    const saved = await updater.update(updates);

    expect(ownerWrites.hold).toHaveBeenCalledWith(
      new NodeOwnerWriteHolderMessage(owner.toPrimitives().publicKey),
      expect.any(Function),
    );
    expect(repository.save).toHaveBeenCalledWith(updates.exceptions);
    expect(saved).toEqual(updates.exceptions);
  });

  it('should save nothing and reapply nothing when the hold refuses', async () => {
    ownerWrites.hold.mockRejectedValue(new Error('refused'));

    await expect(updater.update(await message())).rejects.toThrow('refused');
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

    await updater.update(await message());

    expect(order).toEqual(['saved', 'released', 'reapplied']);
  });
});
