import { Community } from '@app/contexts/communities/domain/Community';

import { CommunityMembersResource } from '../resources/CommunityMembersResource';

export class CommunityMembersViewModel {
  constructor(private readonly community: Community) {}

  public toResource(): CommunityMembersResource {
    return {
      memberIds: this.community.toPrimitives().memberIds,
    };
  }
}
