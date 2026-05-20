import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityModerationLogId extends StringValueObject {
  public static generate(): CommunityModerationLogId {
    return new CommunityModerationLogId(ShortId.generate().valueOf());
  }
}
