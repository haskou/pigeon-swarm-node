import { ShortId, StringValueObject } from '@haskou/value-objects';

export class MessageId extends StringValueObject {
  public static generate(): MessageId {
    return new MessageId(ShortId.generate().valueOf());
  }
}
