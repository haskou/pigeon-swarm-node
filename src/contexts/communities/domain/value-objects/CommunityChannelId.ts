import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityChannelId extends StringValueObject {
  public static generate(): CommunityChannelId {
    return new CommunityChannelId(ShortId.generate().valueOf());
  }
}
