import PublishedNodeBlockListFinder from '@app/contexts/nodes/application/find-published-block-list/PublishedNodeBlockListFinder';
import { NodeBlockPublication } from '@app/contexts/nodes/domain/NodeBlockPublication';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockPublicationRepository from '@app/contexts/nodes/domain/repositories/NodeBlockPublicationRepository';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('PublishedNodeBlockListFinder', () => {
  let publications: MockProxy<NodeBlockPublicationRepository>;
  let lists: MockProxy<NodeBlockListRepository>;
  let finder: PublishedNodeBlockListFinder;

  beforeEach(async () => {
    publications = mock<NodeBlockPublicationRepository>();
    lists = mock<NodeBlockListRepository>();
    lists.findLocal.mockResolvedValue(
      new NodeBlockListMother(await KeyPair.generate()).build(),
    );
    finder = new PublishedNodeBlockListFinder(publications, lists);
  });

  it('should publish nothing until the owner opts in', async () => {
    publications.find.mockResolvedValue(NodeBlockPublication.unpublished());

    expect((await finder.find()).toPrimitives()).toBeUndefined();
    expect(lists.findLocal).not.toHaveBeenCalled();
  });

  it('should return the stored list once the owner published it', async () => {
    const stored = await lists.findLocal();

    publications.find.mockResolvedValue(new NodeBlockPublication(true));

    expect((await finder.find()).toPrimitives()).toEqual(stored.toPrimitives());
  });
});
