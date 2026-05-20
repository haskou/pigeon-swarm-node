import { ShortId, StringValueObject } from '@haskou/value-objects';

export class PollId extends StringValueObject {
  public static generate(): PollId {
    return new PollId(ShortId.generate().valueOf());
  }
}
