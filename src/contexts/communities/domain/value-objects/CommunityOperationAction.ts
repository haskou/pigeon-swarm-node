import { Enum } from '@haskou/value-objects';

const communityOperationActions = {
  CHANNEL_CREATED: 'channel_created',
  CHANNEL_DELETED: 'channel_deleted',
  CHANNEL_PERMISSIONS_UPDATED: 'channel_permissions_updated',
  CHANNEL_RENAMED: 'channel_renamed',
  COMMUNITY_CREATED: 'community_created',
  COMMUNITY_UPDATED: 'community_updated',
  MEMBER_BANNED: 'member_banned',
  MEMBER_JOINED: 'member_joined',
  MEMBER_KICKED: 'member_kicked',
  MEMBER_LEFT: 'member_left',
  MEMBER_ROLES_UPDATED: 'member_roles_updated',
  MEMBER_UNBANNED: 'member_unbanned',
  ROLE_CREATED: 'role_created',
  ROLE_DELETED: 'role_deleted',
  ROLE_UPDATED: 'role_updated',
} as const;

export class CommunityOperationAction extends Enum<string> {
  public static readonly CHANNEL_CREATED = new CommunityOperationAction(
    communityOperationActions.CHANNEL_CREATED,
  );

  public static readonly CHANNEL_DELETED = new CommunityOperationAction(
    communityOperationActions.CHANNEL_DELETED,
  );

  public static readonly CHANNEL_PERMISSIONS_UPDATED =
    new CommunityOperationAction(
      communityOperationActions.CHANNEL_PERMISSIONS_UPDATED,
    );

  public static readonly CHANNEL_RENAMED = new CommunityOperationAction(
    communityOperationActions.CHANNEL_RENAMED,
  );

  public static readonly COMMUNITY_CREATED = new CommunityOperationAction(
    communityOperationActions.COMMUNITY_CREATED,
  );

  public static readonly COMMUNITY_UPDATED = new CommunityOperationAction(
    communityOperationActions.COMMUNITY_UPDATED,
  );

  public static readonly MEMBER_BANNED = new CommunityOperationAction(
    communityOperationActions.MEMBER_BANNED,
  );

  public static readonly MEMBER_JOINED = new CommunityOperationAction(
    communityOperationActions.MEMBER_JOINED,
  );

  public static readonly MEMBER_KICKED = new CommunityOperationAction(
    communityOperationActions.MEMBER_KICKED,
  );

  public static readonly MEMBER_LEFT = new CommunityOperationAction(
    communityOperationActions.MEMBER_LEFT,
  );

  public static readonly MEMBER_ROLES_UPDATED = new CommunityOperationAction(
    communityOperationActions.MEMBER_ROLES_UPDATED,
  );

  public static readonly MEMBER_UNBANNED = new CommunityOperationAction(
    communityOperationActions.MEMBER_UNBANNED,
  );

  public static readonly ROLE_CREATED = new CommunityOperationAction(
    communityOperationActions.ROLE_CREATED,
  );

  public static readonly ROLE_DELETED = new CommunityOperationAction(
    communityOperationActions.ROLE_DELETED,
  );

  public static readonly ROLE_UPDATED = new CommunityOperationAction(
    communityOperationActions.ROLE_UPDATED,
  );

  public getValues(): string[] {
    return Object.values(communityOperationActions);
  }

  public isGenesis(): boolean {
    return this.isEqual(CommunityOperationAction.COMMUNITY_CREATED);
  }
}
