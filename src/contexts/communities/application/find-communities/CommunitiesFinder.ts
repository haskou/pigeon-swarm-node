import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunitiesPage } from './CommunitiesPage';
import { CommunitiesFindMessage } from './messages/CommunitiesFindMessage';

export default class CommunitiesFinder {
  constructor(private readonly communityRepository: CommunityRepository) {}

  public async find(message: CommunitiesFindMessage): Promise<CommunitiesPage> {
    const communities = await this.communityRepository.findByMember(
      message.identityId,
    );

    return new CommunitiesPage(
      PageSlice.of({
        after: message.after,
        items: communities,
        limit: message.limit,
        order: 'asc',
        position: (community) => community.getId().valueOf(),
      }),
    );
  }
}
