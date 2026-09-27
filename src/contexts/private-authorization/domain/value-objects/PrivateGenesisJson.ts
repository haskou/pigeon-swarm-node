import { StringValueObject } from '@haskou/value-objects';

export class PrivateGenesisJson extends StringValueObject {
  private static readonly MAX_CHARACTERS = 256 * 1_024;

  public constructor(value: string | StringValueObject) {
    super(value, PrivateGenesisJson.MAX_CHARACTERS);
  }
}
