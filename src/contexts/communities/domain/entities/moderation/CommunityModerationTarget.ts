import {
  PrimitiveOf,
  StringValueObject,
  ValueObject,
} from '@haskou/value-objects';

import { CommunityModerationTargetType } from '../../value-objects/CommunityModerationTargetType';

export class CommunityModerationTarget {
  public static create(
    type: CommunityModerationTargetType,
    id: ValueObject<string>,
  ): CommunityModerationTarget {
    return new CommunityModerationTarget(type, id);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityModerationTarget>,
  ): CommunityModerationTarget {
    return new CommunityModerationTarget(
      new CommunityModerationTargetType(primitives.type),
      new StringValueObject(primitives.id),
    );
  }

  constructor(
    private readonly type: CommunityModerationTargetType,
    private readonly id: ValueObject<string>,
  ) {}

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
