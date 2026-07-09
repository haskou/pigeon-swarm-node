import { PrimitiveOf } from '@haskou/value-objects';

import { PollOptionId } from './value-objects/PollOptionId';
import { PollOptionText } from './value-objects/PollOptionText';

export class PollOption {
  public static create(id: PollOptionId, text: PollOptionText): PollOption {
    return new PollOption(id, text);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<PollOption>,
  ): PollOption {
    return new PollOption(
      new PollOptionId(primitives.id),
      new PollOptionText(primitives.text),
    );
  }

  constructor(
    private readonly id: PollOptionId,
    private readonly text: PollOptionText,
  ) {}

  public getId(): PollOptionId {
    return this.id;
  }

  public isIdentifiedBy(optionId: PollOptionId): boolean {
    return this.id.isEqual(optionId);
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      text: this.text.valueOf(),
    };
  }
}
