import { NodeBlockSourceAdopterMessage } from '@app/contexts/nodes/application/adopt-block-source/messages/NodeBlockSourceAdopterMessage';
import NodeBlockSourceAdopter from '@app/contexts/nodes/application/adopt-block-source/NodeBlockSourceAdopter';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
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
    const policy = mock<NodeBlockPolicy>();
    const ownerWrites = mock<NodeOwnerWriteHolder>();

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
});
