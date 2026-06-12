import { StringValueObject } from '@haskou/value-objects';

export class ContentType extends StringValueObject {
  public static readonly DEFAULT = new ContentType('application/octet-stream');

  constructor(value: string | StringValueObject) {
    super(value, 255);
  }
}
