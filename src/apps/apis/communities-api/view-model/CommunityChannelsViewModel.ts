import { Community } from '@app/contexts/communities/domain/Community';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelsResource } from '../resources/CommunityChannelsResource';

export class CommunityChannelsViewModel {
  constructor(
    private readonly community: Community,
    private readonly viewerIdentityId: IdentityId,
    private readonly connectedIdentityIdsByChannelId: Map<
      string,
      string[]
    > = new Map(),
  ) {}

  public toResource(): CommunityChannelsResource {
    const primitives = this.community.visibleChannelsFor(this.viewerIdentityId);

    return {
      channels: [
        ...primitives.textChannels,
        ...primitives.voiceChannels.map((channel) => ({
          ...channel,
          connectedIdentityIds:
            this.connectedIdentityIdsByChannelId.get(channel.id) || [],
        })),
      ],
    };
  }
}
