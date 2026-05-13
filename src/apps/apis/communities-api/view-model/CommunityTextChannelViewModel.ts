import { CommunityTextChannel } from '@app/contexts/communities/domain/CommunityTextChannel';

import { CommunityTextChannelResource } from '../resources/CommunityResource';

export class CommunityTextChannelViewModel {
  constructor(private readonly channel: CommunityTextChannel) {}

  public toResource(): CommunityTextChannelResource {
    return this.channel.toPrimitives();
  }
}
