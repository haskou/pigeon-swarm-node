import { Enum } from '@haskou/value-objects';

const communityModerationActions = {
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

export class CommunityModerationAction extends Enum<string> {
  public static readonly CHANNEL_CREATED = new CommunityModerationAction(
    communityModerationActions.CHANNEL_CREATED,
  );

  public static readonly CHANNEL_DELETED = new CommunityModerationAction(
    communityModerationActions.CHANNEL_DELETED,
  );

  public static readonly CHANNEL_PERMISSIONS_UPDATED =
    new CommunityModerationAction(
      communityModerationActions.CHANNEL_PERMISSIONS_UPDATED,
    );

  public static readonly CHANNEL_RENAMED = new CommunityModerationAction(
    communityModerationActions.CHANNEL_RENAMED,
  );

  public static readonly COMMUNITY_UPDATED = new CommunityModerationAction(
    communityModerationActions.COMMUNITY_UPDATED,
  );

  public static readonly INVITATION_CREATED = new CommunityModerationAction(
    communityModerationActions.INVITATION_CREATED,
  );

  public static readonly INVITE_LINK_CREATED = new CommunityModerationAction(
    communityModerationActions.INVITE_LINK_CREATED,
  );

  public static readonly MEMBER_BANNED = new CommunityModerationAction(
    communityModerationActions.MEMBER_BANNED,
  );

  public static readonly MEMBER_ROLES_UPDATED = new CommunityModerationAction(
    communityModerationActions.MEMBER_ROLES_UPDATED,
  );

  public static readonly MEMBER_UNBANNED = new CommunityModerationAction(
    communityModerationActions.MEMBER_UNBANNED,
  );

  public static readonly MEMBERSHIP_REQUEST_ACCEPTED =
    new CommunityModerationAction(
      communityModerationActions.MEMBERSHIP_REQUEST_ACCEPTED,
    );

  public static readonly MEMBERSHIP_REQUEST_DECLINED =
    new CommunityModerationAction(
      communityModerationActions.MEMBERSHIP_REQUEST_DECLINED,
    );

  public static readonly MESSAGE_DELETED = new CommunityModerationAction(
    communityModerationActions.MESSAGE_DELETED,
  );

  public static readonly ROLE_CREATED = new CommunityModerationAction(
    communityModerationActions.ROLE_CREATED,
  );

  public static readonly ROLE_DELETED = new CommunityModerationAction(
    communityModerationActions.ROLE_DELETED,
  );

  public static readonly ROLE_UPDATED = new CommunityModerationAction(
    communityModerationActions.ROLE_UPDATED,
  );

  public getValues(): string[] {
    return Object.values(communityModerationActions);
  }
}
