import { StringValueObject } from '@haskou/value-objects';

export class CommunityName extends StringValueObject {
  private static readonly MAX_LENGTH = 80;

  constructor(value: string | StringValueObject) {
    super(value, CommunityName.MAX_LENGTH);
  }
}
