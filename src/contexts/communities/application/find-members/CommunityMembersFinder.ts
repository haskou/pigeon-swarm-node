import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityMembersPage } from './CommunityMembersPage';
import { CommunityMembersFindMessage } from './messages/CommunityMembersFindMessage';

export default class CommunityMembersFinder {
  constructor(private readonly communityFinder: CommunityFinder) {}

  public async find(
    message: CommunityMembersFindMessage,
  ): Promise<CommunityMembersPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.actorIdentityId);

    return new CommunityMembersPage(
      PageSlice.of<string>({
        after: message.after,
        items: community.toPrimitives().memberIds,
        limit: message.limit,
        order: 'asc',
        position: (memberId) => memberId,
      }),
    );
  }
}
