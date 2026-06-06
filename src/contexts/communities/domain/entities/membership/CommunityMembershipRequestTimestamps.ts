import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

export class CommunityMembershipRequestTimestamps {
  public static now(): CommunityMembershipRequestTimestamps {
    const now = Timestamp.now();

    return new CommunityMembershipRequestTimestamps(now, now);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityMembershipRequestTimestamps>,
  ): CommunityMembershipRequestTimestamps {
    return new CommunityMembershipRequestTimestamps(
      new Timestamp(primitives.createdAt),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly createdAt: Timestamp,
    private readonly updatedAt: Timestamp,
  ) {}

  public touch(): CommunityMembershipRequestTimestamps {
    return new CommunityMembershipRequestTimestamps(
      this.createdAt,
      Timestamp.now(),
    );
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
