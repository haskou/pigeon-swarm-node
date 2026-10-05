import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

export class CommunityMembershipRequestTimestamps {
  public static at(createdAt: Timestamp): CommunityMembershipRequestTimestamps {
    return new CommunityMembershipRequestTimestamps(createdAt, createdAt);
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

  public touch(updatedAt: Timestamp): CommunityMembershipRequestTimestamps {
    return new CommunityMembershipRequestTimestamps(this.createdAt, updatedAt);
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
