import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelThreadSummary } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
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
    private readonly threadSummariesByChannelId: Map<
      string,
      CommunityChannelThreadSummary[]
    > = new Map(),
  ) {}

  public toResource(): CommunityChannelsResource {
    const primitives = this.community.visibleChannelsFor(this.viewerIdentityId);

    return {
      channels: [
        ...primitives.textChannels.map((channel) => ({
          ...channel,
          threads: this.threadSummariesByChannelId.get(channel.id) || [],
        })),
        ...primitives.voiceChannels.map((channel) => ({
          ...channel,
          connectedIdentityIds:
            this.connectedIdentityIdsByChannelId.get(channel.id) || [],
        })),
      ],
    };
  }
}
