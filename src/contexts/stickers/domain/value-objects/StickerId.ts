import { ShortId, StringValueObject } from '@haskou/value-objects';

export class StickerId extends StringValueObject {
  public static generate(): StickerId {
    return new StickerId(ShortId.generate().valueOf());
  }
}
