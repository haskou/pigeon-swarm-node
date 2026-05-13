import { assert } from '@haskou/value-objects';

import { CommunityTextChannel } from './CommunityTextChannel';
import { CommunityVoiceChannel } from './CommunityVoiceChannel';
import { CommunityChannelNotFoundError } from './errors/CommunityChannelNotFoundError';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelName } from './value-objects/CommunityChannelName';

export class CommunityChannels {
  constructor(
    private readonly textChannels: CommunityTextChannel[],
    private readonly voiceChannels: CommunityVoiceChannel[],
  ) {}

  private find(channelId: CommunityChannelId) {
    return [...this.textChannels, ...this.voiceChannels].find((candidate) =>
      candidate.getId().isEqual(channelId),
    );
  }

  public addText(name: CommunityChannelName): CommunityTextChannel {
    const channel = CommunityTextChannel.create(name);

    this.textChannels.push(channel);

    return channel;
  }

  public addVoice(name: CommunityChannelName): CommunityVoiceChannel {
    const channel = CommunityVoiceChannel.create(name);

    this.voiceChannels.push(channel);

    return channel;
  }

  public assertHasText(channelId: CommunityChannelId): void {
    const channel = this.textChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());
  }

  public assertHasVoice(channelId: CommunityChannelId): void {
    const channel = this.voiceChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());
  }

  public rename(
    channelId: CommunityChannelId,
    name: CommunityChannelName,
  ): void {
    const channel = this.find(channelId);

    assert(channel, new CommunityChannelNotFoundError());
    channel?.rename(name);
  }

  public toPrimitives() {
    return {
      textChannels: this.textChannels.map((channel) => channel.toPrimitives()),
      voiceChannels: this.voiceChannels.map((channel) =>
        channel.toPrimitives(),
      ),
    };
  }
}
