import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import CommunityRepositoryNodeCommunityStateDigester from '@app/contexts/nodes/infrastructure/network-synchronization/CommunityRepositoryNodeCommunityStateDigester';
import { mock, MockProxy } from 'jest-mock-extended';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

const { communityFrontiers } = cryptoVectors<{
  communityFrontiers: {
    valid: {
      args: [{ communityId: string; frontier: string[] }[]];
      id: string;
      name: string;
    }[];
  };
}>('commitment-ids');

describe('CommunityRepositoryNodeCommunityStateDigester', () => {
  let communityRepository: MockProxy<CommunityRepository>;
  let digester: CommunityRepositoryNodeCommunityStateDigester;

  beforeEach(() => {
    communityRepository = mock<CommunityRepository>();
    digester = new CommunityRepositoryNodeCommunityStateDigester(
      communityRepository,
    );
  });

  it.each(communityFrontiers.valid)(
    'digests $name like the library vectors',
    async ({ args: [entries], id }) => {
      communityRepository.findFrontiersByNetwork.mockResolvedValue(
        entries.map(({ communityId, frontier }) => ({
          communityId: new CommunityId(communityId),
          frontier,
        })),
      );

      await expect(digester.digest('network-1')).resolves.toEqual(
        new NodeCommunityStateDigest(id),
      );
    },
  );

  it('digests the community frontiers of one network', async () => {
    communityRepository.findFrontiersByNetwork.mockResolvedValue([
      { communityId: new CommunityId('community-1'), frontier: ['hash-1'] },
    ]);

    const digest = await digester.digest('network-1');

    expect(communityRepository.findFrontiersByNetwork).toHaveBeenCalledWith(
      'network-1',
    );
    expect(digest.valueOf()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('does not depend on the order communities and frontier hashes are read in', async () => {
    communityRepository.findFrontiersByNetwork.mockResolvedValueOnce([
      { communityId: new CommunityId('community-1'), frontier: ['a', 'b'] },
      { communityId: new CommunityId('community-2'), frontier: ['c'] },
    ]);
    communityRepository.findFrontiersByNetwork.mockResolvedValueOnce([
      { communityId: new CommunityId('community-2'), frontier: ['c'] },
      { communityId: new CommunityId('community-1'), frontier: ['b', 'a'] },
    ]);

    await expect(digester.digest('network-1')).resolves.toEqual(
      await digester.digest('network-1'),
    );
  });

  it('changes when any community frontier differs', async () => {
    communityRepository.findFrontiersByNetwork.mockResolvedValueOnce([
      { communityId: new CommunityId('community-1'), frontier: ['a'] },
    ]);
    communityRepository.findFrontiersByNetwork.mockResolvedValueOnce([
      { communityId: new CommunityId('community-1'), frontier: ['b'] },
    ]);
    communityRepository.findFrontiersByNetwork.mockResolvedValueOnce([]);

    const first = await digester.digest('network-1');
    const second = await digester.digest('network-1');
    const empty = await digester.digest('network-1');

    expect(first.isEqual(second)).toBe(false);
    expect(first.isEqual(empty)).toBe(false);
  });
});
