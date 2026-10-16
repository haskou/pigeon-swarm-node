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
  let mother: NodeBlockListMother;

  beforeEach(async () => {
    publications = mock<NodeBlockPublicationRepository>();
    lists = mock<NodeBlockListRepository>();
    mother = new NodeBlockListMother(await KeyPair.generate());
    lists.findLocal.mockResolvedValue(mother.build());
    finder = new PublishedNodeBlockListFinder(publications, lists);
  });

  it('should publish nothing until the owner opts in', async () => {
    publications.find.mockResolvedValue(NodeBlockPublication.unpublished());

    expect((await finder.find()).toSigned()).toBeUndefined();
    expect(lists.findLocal).not.toHaveBeenCalled();
  });

  it('should serve the stored list as the bytes its owner signed once published', async () => {
    publications.find.mockResolvedValue(new NodeBlockPublication(true));

    expect((await finder.find()).toSigned()?.isEqual(mother.signed())).toBe(
      true,
    );
  });
});
