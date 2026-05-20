import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityRoleId extends StringValueObject {
  public static readonly EVERYONE_VALUE = 'everyone';

  public static everyone(): CommunityRoleId {
    return new CommunityRoleId(CommunityRoleId.EVERYONE_VALUE);
  }

  public static generate(): CommunityRoleId {
    return new CommunityRoleId(ShortId.generate().valueOf());
  }

  public isEveryone(): boolean {
    return this.isEqual(CommunityRoleId.everyone());
  }
}
