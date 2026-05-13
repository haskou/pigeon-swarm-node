import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityChannelMessageId extends StringValueObject {
  public static generate(): CommunityChannelMessageId {
    return new CommunityChannelMessageId(ShortId.generate().valueOf());
  }
}
