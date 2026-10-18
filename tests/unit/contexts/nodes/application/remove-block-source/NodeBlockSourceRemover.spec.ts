import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
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
  let remover: NodeBlockSourceRemover;

  beforeEach(() => {
    repository = mock<NodeBlockSourceRepository>();
    policy = mock<NodeBlockPolicy>();
    const ownerWrites = mock<NodeOwnerWriteHolder>();

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
});
