import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelThreadSummary } from '@app/contexts/communities/domain/CommunityChannelThreadSummary';
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
        ...primitives.textChannels.map((channel) => {
          const threads = this.threadSummariesByChannelId.get(channel.id) || [];

          return threads.length > 0
            ? {
                ...channel,
                threads: threads.map((thread) => thread.toPrimitives()),
              }
            : channel;
        }),
        ...primitives.voiceChannels.map((channel) => ({
          ...channel,
          connectedIdentityIds:
            this.connectedIdentityIdsByChannelId.get(channel.id) || [],
        })),
      ],
    };
  }
}
