import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelThreadSummary } from '@app/contexts/communities/domain/CommunityChannelThreadSummary';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelResource } from '../resources/CommunityChannelResource';
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
    private readonly pageChannelIds: string[] = [],
    private readonly nextCursor: string | null = null,
  ) {}

  public toResource(): CommunityChannelsResource {
    const visible = this.community.visibleChannelsFor(this.viewerIdentityId);
    const textChannelsById = new Map(
      visible.textChannels.map((channel) => [channel.id, channel]),
    );
    const voiceChannelsById = new Map(
      (visible.voiceChannels ?? []).map((channel) => [channel.id, channel]),
    );

    return {
      channels: this.pageChannelIds.flatMap(
        (channelId): CommunityChannelResource[] => {
          const textChannel = textChannelsById.get(channelId);

          if (textChannel) {
            const threads =
              this.threadSummariesByChannelId.get(channelId) || [];

            return [
              threads.length > 0
                ? {
                    ...textChannel,
                    threads: threads.map((thread) => thread.toPrimitives()),
                  }
                : textChannel,
            ];
          }

          const voiceChannel = voiceChannelsById.get(channelId);

          return voiceChannel
            ? [
                {
                  ...voiceChannel,
                  connectedIdentityIds:
                    this.connectedIdentityIdsByChannelId.get(channelId) || [],
                },
              ]
            : [];
        },
      ),
      nextCursor: this.nextCursor,
    };
  }
}
