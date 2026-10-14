import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityOperationsFinder from '@app/contexts/communities/application/find-operations/CommunityOperationsFinder';
import { CommunityOperationsFindMessage } from '@app/contexts/communities/application/find-operations/messages/CommunityOperationsFindMessage';
import { CommunityMemberNotFoundError } from '@app/contexts/communities/domain/errors/CommunityMemberNotFoundError';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityOperationApplier } from '@app/contexts/communities/domain/operations/CommunityOperationApplier';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  alice,
  communityId,
  genesis,
  join,
  mallory,
  networkId,
} from '../../domain/operations/CommunityOperationFixtures';

describe(CommunityOperationsFinder.name, () => {
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let finder: CommunityOperationsFinder;

  beforeEach(() => {
    const created = genesis();
    const community = CommunityOperationApplier.create(created);

    CommunityOperationApplier.apply(community, join([created], alice));
    communityFinder = mock<CommunityFinder>();
    communityFinder.findById.mockResolvedValue(community);
    communityRepository = mock<CommunityRepository>();
    finder = new CommunityOperationsFinder(
      communityFinder,
      communityRepository,
    );
  });

  const messageBy = (actor: string): CommunityOperationsFindMessage =>
    new CommunityOperationsFindMessage(
      communityId.valueOf(),
      actor,
      2,
      'A'.repeat(43),
    );

  it('serves a member one page of the community operations', async () => {
    const operations = [genesis()];
    communityRepository.findOperations.mockResolvedValue(operations);

    const page = await finder.find(messageBy(alice.valueOf()));

    expect(page.getCommunityId().valueOf()).toBe(communityId.valueOf());
    expect(page.getNetworkId().valueOf()).toBe(networkId.valueOf());
    expect(page.getOperations()).toEqual(operations);
    expect(communityRepository.findOperations).toHaveBeenCalledWith(
      communityId,
      'A'.repeat(43),
      2,
    );
  });

  it('denies a non-member before reading any operation', async () => {
    await expect(
      finder.find(messageBy(mallory.valueOf())),
    ).rejects.toBeInstanceOf(CommunityMemberNotFoundError);
    expect(communityRepository.findOperations).not.toHaveBeenCalled();
  });

  it('reports an unknown community', async () => {
    communityFinder.findById.mockRejectedValue(new CommunityNotFoundError());

    await expect(
      finder.find(messageBy(alice.valueOf())),
    ).rejects.toBeInstanceOf(CommunityNotFoundError);
    expect(communityRepository.findOperations).not.toHaveBeenCalled();
  });
});
