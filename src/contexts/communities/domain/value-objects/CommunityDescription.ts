import { StringValueObject } from '@haskou/value-objects';

export class CommunityDescription extends StringValueObject {
  private static readonly MAX_LENGTH = 500;

  constructor(value: string | StringValueObject) {
    super(value, CommunityDescription.MAX_LENGTH);
  }
}
