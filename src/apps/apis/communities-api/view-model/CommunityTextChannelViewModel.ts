import { CommunityTextChannel } from '@app/contexts/communities/domain/entities/channels/CommunityTextChannel';

import { CommunityTextChannelResource } from '../resources/CommunityTextChannelResource';

export class CommunityTextChannelViewModel {
  constructor(private readonly channel: CommunityTextChannel) {}

  public toResource(): CommunityTextChannelResource {
    return this.channel.toPrimitives();
  }
}
