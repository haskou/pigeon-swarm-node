import CommunityFinder from '../find-community/CommunityFinder';
import { PageSlice } from '../pagination/PageSlice';
import { CommunityRolesPage } from './CommunityRolesPage';
import { CommunityRolesFindMessage } from './messages/CommunityRolesFindMessage';

export default class CommunityRolesFinder {
  constructor(private readonly communityFinder: CommunityFinder) {}

  public async find(
    message: CommunityRolesFindMessage,
  ): Promise<CommunityRolesPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.actorIdentityId);

    const roles = community.toPrimitives().roles;

    return new CommunityRolesPage(
      community,
      PageSlice.of({
        after: message.after,
        items: roles,
        limit: message.limit,
        order: 'asc',
        position: (role) => role.id,
      }),
    );
  }
}
