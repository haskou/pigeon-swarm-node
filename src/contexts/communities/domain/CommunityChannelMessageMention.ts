import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityMentionTargetId } from './value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from './value-objects/CommunityMentionType';

export class CommunityChannelMessageMention {
  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityChannelMessageMention>,
  ): CommunityChannelMessageMention {
    return new CommunityChannelMessageMention(
      new CommunityMentionType(primitives.type),
      primitives.targetId
        ? new CommunityMentionTargetId(primitives.targetId)
        : undefined,
    );
  }

  constructor(
    private readonly type: CommunityMentionType,
    private readonly targetId?: CommunityMentionTargetId,
  ) {}

  public isEveryone(): boolean {
    return this.type.isEveryone();
  }

  public isHere(): boolean {
    return this.type.isHere();
  }

  public isRole(): boolean {
    return this.type.isRole();
  }

  public toPrimitives() {
    return {
      targetId: this.targetId?.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
