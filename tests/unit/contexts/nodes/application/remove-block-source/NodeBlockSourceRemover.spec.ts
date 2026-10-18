import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import { NodeBlockSourceRemoverMessage } from '@app/contexts/nodes/application/remove-block-source/messages/NodeBlockSourceRemoverMessage';
import NodeBlockSourceRemover from '@app/contexts/nodes/application/remove-block-source/NodeBlockSourceRemover';
import { NodeBlockSourceNotFoundError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceNotFoundError';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('NodeBlockSourceRemover', () => {
  let repository: MockProxy<NodeBlockSourceRepository>;
  let policy: MockProxy<NodeBlockPolicy>;
  let ownerWrites: MockProxy<NodeOwnerWriteHolder>;
  let remover: NodeBlockSourceRemover;

  beforeEach(() => {
    repository = mock<NodeBlockSourceRepository>();
    policy = mock<NodeBlockPolicy>();
    ownerWrites = mock<NodeOwnerWriteHolder>();

    ownerWrites.hold.mockImplementation(async (_message, write) => write());
    remover = new NodeBlockSourceRemover(repository, policy, ownerWrites);
  });

  it('should delete the source through the policy so its effect ends at once', async () => {
    const ownerIdentityId = await NodeBlockListMother.identityId();

    repository.exists.mockResolvedValue(true);

    await remover.remove(
      new NodeBlockSourceRemoverMessage(
        ownerIdentityId.valueOf(),
        ownerIdentityId.valueOf(),
      ),
    );

    expect(policy.reapply).toHaveBeenCalledTimes(1);
    expect(repository.delete).toHaveBeenCalledWith(ownerIdentityId);
  });

  it('should refuse removing a source that is not adopted', async () => {
    const ownerIdentityId = await NodeBlockListMother.identityId();

    repository.exists.mockResolvedValue(false);

    await expect(
      remover.remove(
        new NodeBlockSourceRemoverMessage(
          ownerIdentityId.valueOf(),
          ownerIdentityId.valueOf(),
        ),
      ),
    ).rejects.toThrow(NodeBlockSourceNotFoundError);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('should hold the write under the authenticated owner id', async () => {
    const publisherId = await NodeBlockListMother.identityId();
    const nodeOwnerId = await NodeBlockListMother.identityId();

    repository.exists.mockResolvedValue(true);

    await remover.remove(
      new NodeBlockSourceRemoverMessage(
        publisherId.valueOf(),
        nodeOwnerId.valueOf(),
      ),
    );

    expect(ownerWrites.hold).toHaveBeenCalledWith(
      new NodeOwnerWriteHolderMessage(nodeOwnerId.valueOf()),
      expect.any(Function),
    );
  });

  it('should delete nothing and reapply nothing when the hold refuses', async () => {
    const ownerIdentityId = await NodeBlockListMother.identityId();

    repository.exists.mockResolvedValue(true);
    ownerWrites.hold.mockRejectedValue(new Error('refused'));

    await expect(
      remover.remove(
        new NodeBlockSourceRemoverMessage(
          ownerIdentityId.valueOf(),
          ownerIdentityId.valueOf(),
        ),
      ),
    ).rejects.toThrow('refused');
    expect(repository.delete).not.toHaveBeenCalled();
    expect(policy.reapply).not.toHaveBeenCalled();
  });

  it('should reapply only after the delete and the hold release', async () => {
    const order: string[] = [];
    const ownerIdentityId = await NodeBlockListMother.identityId();

    repository.exists.mockResolvedValue(true);
    repository.delete.mockImplementation(async () => {
      order.push('deleted');
    });
    ownerWrites.hold.mockImplementation(async (_message, write) => {
      const result = await write();

      order.push('released');

      return result;
    });
    policy.reapply.mockImplementation(async () => {
      order.push('reapplied');
    });

    await remover.remove(
      new NodeBlockSourceRemoverMessage(
        ownerIdentityId.valueOf(),
        ownerIdentityId.valueOf(),
      ),
    );

    expect(order).toEqual(['deleted', 'released', 'reapplied']);
  });
});
