import { CommunityVoiceChannel } from '@app/contexts/communities/domain/CommunityVoiceChannel';

import { CommunityVoiceChannelResource } from '../resources/CommunityResource';

export class CommunityVoiceChannelViewModel {
  constructor(private readonly channel: CommunityVoiceChannel) {}

  public toResource(): CommunityVoiceChannelResource {
    return {
      ...this.channel.toPrimitives(),
      connectedIdentityIds: [],
    };
  }
}
