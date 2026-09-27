import { StringValueObject } from '@haskou/value-objects';

export class PrivateOperationJson extends StringValueObject {
  public static readonly MAX_CHARACTERS = 256 * 1_024;

  public constructor(value: string | StringValueObject) {
    super(value, PrivateOperationJson.MAX_CHARACTERS);
  }
}
