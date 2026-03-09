import { StringValueObject } from '@haskou/value-objects';

export class ProfileBiography extends StringValueObject {
  private static readonly MAX_LENGTH = 100;

  constructor(value: string) {
    super(value, ProfileBiography.MAX_LENGTH);
  }
}
