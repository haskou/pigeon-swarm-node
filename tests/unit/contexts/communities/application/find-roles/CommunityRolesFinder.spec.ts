import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityRolesFinder from '@app/contexts/communities/application/find-roles/CommunityRolesFinder';
import { CommunityRolesFindMessage } from '@app/contexts/communities/application/find-roles/messages/CommunityRolesFindMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock } from 'jest-mock-extended';

describe('CommunityRolesFinder', () => {
  const actorIdentityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const communityFinder = mock<CommunityFinder>();

  function givenRoles(ids: string[], viewAsMember = jest.fn()): void {
    const community = {
      toPrimitives: () => ({ roles: ids.map((id) => ({ id })) }),
      viewAsMember,
    } as unknown as Community;

    communityFinder.findById.mockResolvedValue(community);
  }

  function find(limit: number, after?: string) {
    return new CommunityRolesFinder(communityFinder).find(
      new CommunityRolesFindMessage(
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
    givenRoles(['role-c', 'role-a', 'role-b']);

    const page = await find(2);

    expect(page.getRoles().map((role) => role.id)).toEqual([
      'role-a',
      'role-b',
    ]);
    expect(page.getNextPosition()).toBe('role-b');
  });

  it('continues strictly after the cursor position', async () => {
    givenRoles(['role-c', 'role-a', 'role-b']);

    const page = await find(2, 'role-b');

    expect(page.getRoles().map((role) => role.id)).toEqual(['role-c']);
    expect(page.getNextPosition()).toBeUndefined();
  });

  it('sets no next position on a short page', async () => {
    givenRoles(['role-b', 'role-a']);

    const page = await find(5);

    expect(page.getRoles().map((role) => role.id)).toEqual([
      'role-a',
      'role-b',
    ]);
    expect(page.getNextPosition()).toBeUndefined();
  });

  it('checks the actor is a member before paging', async () => {
    const viewAsMember = jest.fn(() => {
      throw new Error('not a member');
    });
    givenRoles(['role-a'], viewAsMember);

    await expect(find(10)).rejects.toThrow('not a member');
    expect(viewAsMember).toHaveBeenCalledWith(new IdentityId(actorIdentityId));
  });
});
