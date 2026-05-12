import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelName } from './value-objects/CommunityChannelName';

export class CommunityTextChannel {
  private static readonly TYPE: 'text' = 'text';

  public static create(name: CommunityChannelName): CommunityTextChannel {
    return new CommunityTextChannel(
      CommunityChannelId.generate(),
      name,
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityTextChannel>,
  ): CommunityTextChannel {
    return new CommunityTextChannel(
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
      type: CommunityTextChannel.TYPE,
    };
  }
}
