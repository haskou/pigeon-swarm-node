import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { PollOptionId } from './value-objects/PollOptionId';

export class PollVote {
  public static create(
    voterIdentityId: IdentityId,
    optionIds: PollOptionId[],
  ): PollVote {
    return new PollVote(voterIdentityId, optionIds, Timestamp.now());
  }

  public static fromPrimitives(primitives: PrimitiveOf<PollVote>): PollVote {
    return new PollVote(
      new IdentityId(primitives.voterIdentityId),
      primitives.optionIds.map((optionId) => new PollOptionId(optionId)),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly voterIdentityId: IdentityId,
    private readonly optionIds: PollOptionId[],
    private readonly createdAt: Timestamp,
  ) {}

  public belongsTo(identityId: IdentityId): boolean {
    return this.voterIdentityId.isEqual(identityId);
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      optionIds: this.optionIds.map((optionId) => optionId.valueOf()),
      voterIdentityId: this.voterIdentityId.valueOf(),
    };
  }
}
