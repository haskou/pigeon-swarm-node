import { Integer, NumberValueObject } from '@haskou/value-objects';

export class CommunityInviteUses extends Integer {
  public static zero(): CommunityInviteUses {
    return new CommunityInviteUses(0);
  }

  constructor(value: number | NumberValueObject) {
    super(value);
  }

  public next(): CommunityInviteUses {
    return new CommunityInviteUses(this.valueOf() + 1);
  }
}
