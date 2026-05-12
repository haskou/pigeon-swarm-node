import { Community } from '@app/contexts/communities/domain/Community';

import { CommunityChannelsResource } from '../resources/CommunityChannelsResource';

export class CommunityChannelsViewModel {
  constructor(private readonly community: Community) {}

  public toResource(): CommunityChannelsResource {
    return {
      channels: this.community.toPrimitives().textChannels,
    };
  }
}
