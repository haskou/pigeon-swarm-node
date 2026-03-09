import { StringValueObject } from '@haskou/value-objects';

export class ProfileName extends StringValueObject {
  private static readonly MAX_LENGTH = 20;

  constructor(value: string | StringValueObject) {
    super(value, ProfileName.MAX_LENGTH);
  }
}
