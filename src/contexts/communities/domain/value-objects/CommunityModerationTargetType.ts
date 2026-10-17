import { Enum } from '@haskou/value-objects';

const communityModerationTargetTypes = {
  CHANNEL: 'channel',
  COMMUNITY: 'community',
  INVITATION: 'invitation',
  MEMBER: 'member',
  MEMBERSHIP_REQUEST: 'membership_request',
  MESSAGE: 'message',
  ROLE: 'role',
} as const;

export class CommunityModerationTargetType extends Enum<string> {
  public static readonly CHANNEL = new CommunityModerationTargetType(
    communityModerationTargetTypes.CHANNEL,
  );

  public static readonly COMMUNITY = new CommunityModerationTargetType(
    communityModerationTargetTypes.COMMUNITY,
  );

  public static readonly INVITATION = new CommunityModerationTargetType(
    communityModerationTargetTypes.INVITATION,
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

  public getValues(): string[] {
    return Object.values(communityModerationTargetTypes);
  }
}
