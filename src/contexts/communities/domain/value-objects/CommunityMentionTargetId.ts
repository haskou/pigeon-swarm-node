import { StringValueObject } from '@haskou/value-objects';

export class CommunityMentionTargetId extends StringValueObject {
  private static readonly MAX_LENGTH = 256;

  constructor(value: string | StringValueObject) {
    super(value, CommunityMentionTargetId.MAX_LENGTH);
  }
}
