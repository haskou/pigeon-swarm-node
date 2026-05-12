import { Community } from '@app/contexts/communities/domain/Community';

import { CommunitiesResource } from '../resources/CommunitiesResource';
import { CommunityViewModel } from './CommunityViewModel';

export class CommunitiesViewModel {
  constructor(private readonly communities: Community[]) {}

  public toResource(): CommunitiesResource {
    return {
      communities: this.communities.map((community) =>
        new CommunityViewModel(community).toResource(),
      ),
    };
  }
}
