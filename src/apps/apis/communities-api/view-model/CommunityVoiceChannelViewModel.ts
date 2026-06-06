import { CommunityVoiceChannel } from '@app/contexts/communities/domain/entities/channels/CommunityVoiceChannel';

import { CommunityVoiceChannelResource } from '../resources/CommunityVoiceChannelResource';

export class CommunityVoiceChannelViewModel {
  constructor(private readonly channel: CommunityVoiceChannel) {}

  public toResource(): CommunityVoiceChannelResource {
    return {
      ...this.channel.toPrimitives(),
      connectedIdentityIds: [],
    };
  }
}
