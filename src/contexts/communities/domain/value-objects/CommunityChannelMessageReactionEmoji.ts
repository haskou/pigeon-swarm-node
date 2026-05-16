import { StringValueObject } from '@haskou/value-objects';

export class CommunityChannelMessageReactionEmoji extends StringValueObject {
  protected maxLength(): number {
    return 64;
  }
}
