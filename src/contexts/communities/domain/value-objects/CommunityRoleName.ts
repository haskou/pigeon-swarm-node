import { StringValueObject } from '@haskou/value-objects';

export class CommunityRoleName extends StringValueObject {
  private static readonly MAX_LENGTH = 50;

  constructor(value: string | StringValueObject) {
    super(value, CommunityRoleName.MAX_LENGTH);
  }
}
