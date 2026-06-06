import { Enum } from '@haskou/value-objects';

import { communityMentionTypes } from './types/CommunityMentionTypes';
import { CommunityMentionTypeValue } from './types/CommunityMentionTypeValue';

export { CommunityMentionTypeValue } from './types/CommunityMentionTypeValue';

export class CommunityMentionType extends Enum<CommunityMentionTypeValue> {
  public static readonly EVERYONE = new CommunityMentionType(
    communityMentionTypes.EVERYONE,
  );

  public static readonly HERE = new CommunityMentionType(
    communityMentionTypes.HERE,
  );

  public static readonly IDENTITY = new CommunityMentionType(
    communityMentionTypes.IDENTITY,
  );

  public static readonly ROLE = new CommunityMentionType(
    communityMentionTypes.ROLE,
  );

  public getValues(): CommunityMentionTypeValue[] {
    return Object.values(communityMentionTypes);
  }

  public isEveryone(): boolean {
    return this.isEqual(CommunityMentionType.EVERYONE);
  }

  public isHere(): boolean {
    return this.isEqual(CommunityMentionType.HERE);
  }

  public isRole(): boolean {
    return this.isEqual(CommunityMentionType.ROLE);
  }
}
