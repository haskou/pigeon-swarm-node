import { StringValueObject } from '@haskou/value-objects';

export class MessageReactionEmoji extends StringValueObject {
  private static readonly MAX_LENGTH = 64;

  constructor(value: string | StringValueObject) {
    super(value, MessageReactionEmoji.MAX_LENGTH);
  }
}
