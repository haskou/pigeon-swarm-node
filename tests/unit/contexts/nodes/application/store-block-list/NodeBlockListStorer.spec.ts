import { NodeBlockListStorerMessage } from '@app/contexts/nodes/application/store-block-list/messages/NodeBlockListStorerMessage';
import NodeBlockListStorer from '@app/contexts/nodes/application/store-block-list/NodeBlockListStorer';
import { NodeBlockListMustBeSignedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeBlockListMustBeSignedByCurrentOwnerError';
import { NodeBlockListSignatureIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeBlockListSignatureIsNotValidError';
import { NodeBlockListVersionIsNotNewerError } from '@app/contexts/nodes/domain/errors/NodeBlockListVersionIsNotNewerError';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeBlockListStorer', () => {
  let loader: MockProxy<NodeLoaderService>;
  let repository: MockProxy<NodeBlockListRepository>;
  let policy: MockProxy<NodeBlockPolicy>;
  let storer: NodeBlockListStorer;
  let owner: KeyPair;
  let node: Node;

  const message = (mother: NodeBlockListMother): NodeBlockListStorerMessage =>
    new NodeBlockListStorerMessage(mother.primitives());

  beforeAll(async () => {
    owner = await KeyPair.generate();
  });

  beforeEach(() => {
    loader = mock<NodeLoaderService>();
    repository = mock<NodeBlockListRepository>();
    policy = mock<NodeBlockPolicy>();
    policy.change.mockImplementation((mutation) => mutation());
    storer = new NodeBlockListStorer(loader, repository, policy);
    node = new NodeMother()
      .withOwner(new IdentityId(owner.toPrimitives().publicKey))
      .build();
    loader.loadNode.mockResolvedValue(node);
    repository.findLocal.mockResolvedValue(new NoNodeBlocks());
  });

  it('should store and apply a newer list signed by the current owner', async () => {
    const stored = await storer.store(
      message(new NodeBlockListMother(owner).withVersion(2)),
    );

    expect(repository.saveLocal).toHaveBeenCalledWith(stored);
    expect(policy.change).toHaveBeenCalledTimes(1);
  });

  it('should refuse a list signed by someone who is not the current owner', async () => {
    await expect(
      storer.store(message(new NodeBlockListMother(await KeyPair.generate()))),
    ).rejects.toThrow(NodeBlockListMustBeSignedByCurrentOwnerError);
    expect(repository.saveLocal).not.toHaveBeenCalled();
  });

  it('should refuse a list whose signature does not verify', async () => {
    const primitives = new NodeBlockListMother(owner).primitives();

    await expect(
      storer.store(
        new NodeBlockListStorerMessage({ ...primitives, version: 9 }),
      ),
    ).rejects.toThrow(NodeBlockListSignatureIsNotValidError);
    expect(repository.saveLocal).not.toHaveBeenCalled();
  });

  it('should refuse a version that is not higher than the stored one', async () => {
    repository.findLocal.mockResolvedValue(
      new NodeBlockListMother(owner).withVersion(5).build(),
    );

    await expect(
      storer.store(message(new NodeBlockListMother(owner).withVersion(5))),
    ).rejects.toThrow(NodeBlockListVersionIsNotNewerError);
    expect(repository.saveLocal).not.toHaveBeenCalled();
  });

  it('should store through the policy, so stores and source updates run one at a time', async () => {
    const earlierChange = Promise.withResolvers<void>();

    policy.change.mockImplementation(async (mutation) => {
      await earlierChange.promise;

      return mutation();
    });

    const storing = storer.store(
      message(new NodeBlockListMother(owner).withVersion(2)),
    );

    await Promise.resolve();
    expect(repository.saveLocal).not.toHaveBeenCalled();

    earlierChange.resolve();
    await storing;
    expect(repository.saveLocal).toHaveBeenCalledTimes(1);
  });
});
