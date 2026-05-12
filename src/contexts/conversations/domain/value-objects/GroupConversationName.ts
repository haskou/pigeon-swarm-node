import { StringValueObject } from '@haskou/value-objects';

export class GroupConversationName extends StringValueObject {
  private static readonly MAX_LENGTH = 80;

  constructor(value: string | StringValueObject) {
    super(value, GroupConversationName.MAX_LENGTH);
  }
}
