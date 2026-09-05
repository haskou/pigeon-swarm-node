import { ShortId } from '@haskou/value-objects';

export class CommunityRequestId extends ShortId {
  public static generate(): CommunityRequestId {
    return new CommunityRequestId(ShortId.generate().valueOf());
  }
}
