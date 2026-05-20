import { Enum } from '@haskou/value-objects';

const moderationActions = {
  CHANNEL_CREATED: 'channel_created',
  CHANNEL_DELETED: 'channel_deleted',
  CHANNEL_PERMISSIONS_UPDATED: 'channel_permissions_updated',
  CHANNEL_RENAMED: 'channel_renamed',
  COMMUNITY_UPDATED: 'community_updated',
  INVITATION_CREATED: 'invitation_created',
  INVITE_LINK_CREATED: 'invite_link_created',
  MEMBER_BANNED: 'member_banned',
  MEMBER_ROLES_UPDATED: 'member_roles_updated',
  MEMBER_UNBANNED: 'member_unbanned',
  MEMBERSHIP_REQUEST_ACCEPTED: 'membership_request_accepted',
  MEMBERSHIP_REQUEST_DECLINED: 'membership_request_declined',
  MESSAGE_DELETED: 'message_deleted',
  ROLE_CREATED: 'role_created',
  ROLE_DELETED: 'role_deleted',
  ROLE_UPDATED: 'role_updated',
} as const;

type ActionValue = (typeof moderationActions)[keyof typeof moderationActions];

export class CommunityModerationAction extends Enum<ActionValue> {
  public static readonly CHANNEL_CREATED = new CommunityModerationAction(
    moderationActions.CHANNEL_CREATED,
  );

  public static readonly CHANNEL_DELETED = new CommunityModerationAction(
    moderationActions.CHANNEL_DELETED,
  );

  public static readonly CHANNEL_PERMISSIONS_UPDATED =
    new CommunityModerationAction(
      moderationActions.CHANNEL_PERMISSIONS_UPDATED,
    );

  public static readonly CHANNEL_RENAMED = new CommunityModerationAction(
    moderationActions.CHANNEL_RENAMED,
  );

  public static readonly COMMUNITY_UPDATED = new CommunityModerationAction(
    moderationActions.COMMUNITY_UPDATED,
  );

  public static readonly INVITATION_CREATED = new CommunityModerationAction(
    moderationActions.INVITATION_CREATED,
  );

  public static readonly INVITE_LINK_CREATED = new CommunityModerationAction(
    moderationActions.INVITE_LINK_CREATED,
  );

  public static readonly MEMBER_BANNED = new CommunityModerationAction(
    moderationActions.MEMBER_BANNED,
  );

  public static readonly MEMBER_ROLES_UPDATED = new CommunityModerationAction(
    moderationActions.MEMBER_ROLES_UPDATED,
  );

  public static readonly MEMBER_UNBANNED = new CommunityModerationAction(
    moderationActions.MEMBER_UNBANNED,
  );

  public static readonly MEMBERSHIP_REQUEST_ACCEPTED =
    new CommunityModerationAction(
      moderationActions.MEMBERSHIP_REQUEST_ACCEPTED,
    );

  public static readonly MEMBERSHIP_REQUEST_DECLINED =
    new CommunityModerationAction(
      moderationActions.MEMBERSHIP_REQUEST_DECLINED,
    );

  public static readonly MESSAGE_DELETED = new CommunityModerationAction(
    moderationActions.MESSAGE_DELETED,
  );

  public static readonly ROLE_CREATED = new CommunityModerationAction(
    moderationActions.ROLE_CREATED,
  );

  public static readonly ROLE_DELETED = new CommunityModerationAction(
    moderationActions.ROLE_DELETED,
  );

  public static readonly ROLE_UPDATED = new CommunityModerationAction(
    moderationActions.ROLE_UPDATED,
  );

  public getValues(): ActionValue[] {
    return Object.values(moderationActions);
  }
}
