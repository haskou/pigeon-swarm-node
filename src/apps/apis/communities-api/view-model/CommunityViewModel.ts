import { Community } from '@app/contexts/communities/domain/Community';

import { CommunityResource } from '../resources/CommunityResource';

export class CommunityViewModel {
  constructor(private readonly community: Community) {}

  public toResource(): CommunityResource {
    return this.community.toPrimitives();
  }
}
