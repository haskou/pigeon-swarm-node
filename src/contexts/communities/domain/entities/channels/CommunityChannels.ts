import { assert } from '@haskou/value-objects';

import { CommunityChannelNotFoundError } from '../../errors/CommunityChannelNotFoundError';
import { CommunityChannelId } from '../../value-objects/CommunityChannelId';
import { CommunityChannelName } from '../../value-objects/CommunityChannelName';
import { CommunityChannelPermissions } from './CommunityChannelPermissions';
import { CommunityTextChannel } from './CommunityTextChannel';
import { CommunityVoiceChannel } from './CommunityVoiceChannel';

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

  private findText(channelId: CommunityChannelId): CommunityTextChannel {
    const channel = this.textChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());

    return channel;
  }

  private findVoice(channelId: CommunityChannelId): CommunityVoiceChannel {
    const channel = this.voiceChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());

    return channel;
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

  public hasText(channelId: CommunityChannelId): boolean {
    return this.textChannels.some((candidate) =>
      candidate.getId().isEqual(channelId),
    );
  }

  public hasVoice(channelId: CommunityChannelId): boolean {
    return this.voiceChannels.some((candidate) =>
      candidate.getId().isEqual(channelId),
    );
  }

  public textChannelPermissions(
    channelId: CommunityChannelId,
  ): CommunityChannelPermissions {
    return this.findText(channelId).getPermissions();
  }

  public voiceChannelPermissions(
    channelId: CommunityChannelId,
  ): CommunityChannelPermissions {
    return this.findVoice(channelId).getPermissions();
  }

  public rename(
    channelId: CommunityChannelId,
    name: CommunityChannelName,
  ): void {
    const channel = this.find(channelId);

    assert(channel, new CommunityChannelNotFoundError());
    channel?.rename(name);
  }

  public remove(channelId: CommunityChannelId): 'text' | 'voice' {
    const textChannelIndex = this.textChannels.findIndex((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    if (textChannelIndex !== -1) {
      this.textChannels.splice(textChannelIndex, 1);

      return 'text';
    }

    const voiceChannelIndex = this.voiceChannels.findIndex((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    if (voiceChannelIndex !== -1) {
      this.voiceChannels.splice(voiceChannelIndex, 1);

      return 'voice';
    }

    throw new CommunityChannelNotFoundError();
  }

  public updatePermissions(
    channelId: CommunityChannelId,
    permissions: CommunityChannelPermissions,
  ): void {
    const channel = this.find(channelId);

    assert(channel, new CommunityChannelNotFoundError());
    channel?.updatePermissions(permissions);
  }

  public toPrimitives() {
    return {
      textChannels: this.textChannels.map((channel) => channel.toPrimitives()),
      voiceChannels: this.voiceChannels.map((channel) =>
        channel.toPrimitives(),
      ),
    };
  }

  public visiblePrimitivesFor(
    canView: (permissions: CommunityChannelPermissions) => boolean,
  ): ReturnType<CommunityChannels['toPrimitives']> {
    return {
      textChannels: this.textChannels
        .filter((channel) => canView(channel.getPermissions()))
        .map((channel) => channel.toPrimitives()),
      voiceChannels: this.voiceChannels
        .filter((channel) => canView(channel.getPermissions()))
        .map((channel) => channel.toPrimitives()),
    };
  }

  public visibleTextChannelIdsFor(
    canView: (permissions: CommunityChannelPermissions) => boolean,
  ): CommunityChannelId[] {
    return this.textChannels
      .filter((channel) => canView(channel.getPermissions()))
      .map((channel) => channel.getId());
  }
}
