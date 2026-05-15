import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelName } from './value-objects/CommunityChannelName';

export class CommunityVoiceChannel {
  public static create(name: CommunityChannelName): CommunityVoiceChannel {
    return new CommunityVoiceChannel(
      CommunityChannelId.generate(),
      name,
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityVoiceChannel>,
  ): CommunityVoiceChannel {
    return new CommunityVoiceChannel(
      new CommunityChannelId(primitives.id),
      new CommunityChannelName(primitives.name),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly id: CommunityChannelId,
    private name: CommunityChannelName,
    private readonly createdAt: Timestamp,
  ) {}

  private type(): 'voice' {
    return 'voice';
  }

  public getId(): CommunityChannelId {
    return this.id;
  }

  public rename(name: CommunityChannelName): void {
    this.name = name;
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      type: this.type(),
    };
  }
}
