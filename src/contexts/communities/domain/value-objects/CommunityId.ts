import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityId extends StringValueObject {
  public static generate(): CommunityId {
    return new CommunityId(ShortId.generate().valueOf());
  }
}
