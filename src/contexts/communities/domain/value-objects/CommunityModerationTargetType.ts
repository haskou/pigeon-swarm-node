import { Enum } from '@haskou/value-objects';

import { communityModerationTargetTypes } from './types/CommunityModerationTargetTypes';
import { CommunityModerationTargetTypeValue as TargetTypeValue } from './types/CommunityModerationTargetTypeValue';

export class CommunityModerationTargetType extends Enum<TargetTypeValue> {
  public static readonly CHANNEL = new CommunityModerationTargetType(
    communityModerationTargetTypes.CHANNEL,
  );

  public static readonly COMMUNITY = new CommunityModerationTargetType(
    communityModerationTargetTypes.COMMUNITY,
  );

  public static readonly INVITE = new CommunityModerationTargetType(
    communityModerationTargetTypes.INVITE,
  );

  public static readonly MEMBER = new CommunityModerationTargetType(
    communityModerationTargetTypes.MEMBER,
  );

  public static readonly MEMBERSHIP_REQUEST = new CommunityModerationTargetType(
    communityModerationTargetTypes.MEMBERSHIP_REQUEST,
  );

  public static readonly MESSAGE = new CommunityModerationTargetType(
    communityModerationTargetTypes.MESSAGE,
  );

  public static readonly ROLE = new CommunityModerationTargetType(
    communityModerationTargetTypes.ROLE,
  );

  public getValues(): TargetTypeValue[] {
    return Object.values(communityModerationTargetTypes);
  }
}
