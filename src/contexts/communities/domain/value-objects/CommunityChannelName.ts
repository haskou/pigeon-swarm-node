import { StringValueObject } from '@haskou/value-objects';

export class CommunityChannelName extends StringValueObject {
  private static readonly MAX_LENGTH = 80;

  constructor(value: string | StringValueObject) {
    super(value, CommunityChannelName.MAX_LENGTH);
  }
}
