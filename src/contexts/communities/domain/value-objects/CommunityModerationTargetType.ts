import { Enum } from '@haskou/value-objects';

const targetTypes = {
  CHANNEL: 'channel',
  COMMUNITY: 'community',
  INVITE: 'invite',
  MEMBER: 'member',
  MEMBERSHIP_REQUEST: 'membership_request',
  MESSAGE: 'message',
  ROLE: 'role',
} as const;

type TargetTypeValue = (typeof targetTypes)[keyof typeof targetTypes];

export class CommunityModerationTargetType extends Enum<TargetTypeValue> {
  public static readonly CHANNEL = new CommunityModerationTargetType(
    targetTypes.CHANNEL,
  );

  public static readonly COMMUNITY = new CommunityModerationTargetType(
    targetTypes.COMMUNITY,
  );

  public static readonly INVITE = new CommunityModerationTargetType(
    targetTypes.INVITE,
  );

  public static readonly MEMBER = new CommunityModerationTargetType(
    targetTypes.MEMBER,
  );

  public static readonly MEMBERSHIP_REQUEST = new CommunityModerationTargetType(
    targetTypes.MEMBERSHIP_REQUEST,
  );

  public static readonly MESSAGE = new CommunityModerationTargetType(
    targetTypes.MESSAGE,
  );

  public static readonly ROLE = new CommunityModerationTargetType(
    targetTypes.ROLE,
  );

  public getValues(): TargetTypeValue[] {
    return Object.values(targetTypes);
  }
}
