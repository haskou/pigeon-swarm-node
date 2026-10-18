import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityMembersFinder from '@app/contexts/communities/application/find-members/CommunityMembersFinder';
import { CommunityMembersFindMessage } from '@app/contexts/communities/application/find-members/messages/CommunityMembersFindMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock } from 'jest-mock-extended';

describe('CommunityMembersFinder', () => {
  const actorIdentityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const communityFinder = mock<CommunityFinder>();

  function givenMembers(memberIds: string[], viewAsMember = jest.fn()): void {
    const community = {
      toPrimitives: () => ({ memberIds }),
      viewAsMember,
    } as unknown as Community;

    communityFinder.findById.mockResolvedValue(community);
  }

  function find(limit: number, after?: string) {
    return new CommunityMembersFinder(communityFinder).find(
      new CommunityMembersFindMessage(
        'community-1',
        actorIdentityId,
        limit,
        after,
      ),
    );
  }

  beforeEach(() => {
    communityFinder.findById.mockReset();
  });

  it('returns the first page in ascending id order with a next position when full', async () => {
    givenMembers(['member-c', 'member-a', 'member-b']);

    const page = await find(2);

    expect(page.getMemberIds()).toEqual(['member-a', 'member-b']);
    expect(page.getNextPosition()).toBe('member-b');
  });

  it('continues strictly after the cursor position', async () => {
    givenMembers(['member-c', 'member-a', 'member-b']);

    const page = await find(2, 'member-b');

    expect(page.getMemberIds()).toEqual(['member-c']);
    expect(page.getNextPosition()).toBeUndefined();
  });

  it('sets no next position on a short page', async () => {
    givenMembers(['member-b', 'member-a']);

    const page = await find(5);

    expect(page.getMemberIds()).toEqual(['member-a', 'member-b']);
    expect(page.getNextPosition()).toBeUndefined();
  });

  it('checks the actor is a member before paging', async () => {
    const viewAsMember = jest.fn(() => {
      throw new Error('not a member');
    });
    givenMembers(['member-a'], viewAsMember);

    await expect(find(10)).rejects.toThrow('not a member');
    expect(viewAsMember).toHaveBeenCalledWith(new IdentityId(actorIdentityId));
  });
});
