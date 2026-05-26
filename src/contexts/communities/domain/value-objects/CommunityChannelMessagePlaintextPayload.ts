import { StringValueObject } from '@haskou/value-objects';

export class CommunityChannelMessagePlaintextPayload extends StringValueObject {
  private static readonly MAX_LENGTH = 20000;

  constructor(value: string | StringValueObject) {
    super(value, CommunityChannelMessagePlaintextPayload.MAX_LENGTH);
  }
}
