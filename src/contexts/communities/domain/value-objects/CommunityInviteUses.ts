import { Integer, NumberValueObject } from '@haskou/value-objects';

export class CommunityInviteUses extends Integer {
  constructor(value: number | NumberValueObject) {
    super(value);
  }
}
