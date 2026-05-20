import { Enum } from '@haskou/value-objects';

export type CommunityPermissionValue =
  | 'approve_members'
  | 'attach_files'
  | 'ban_members'
  | 'connect_voice'
  | 'create_invites'
  | 'create_polls'
  | 'embed_links'
  | 'manage_channels'
  | 'manage_members'
  | 'manage_messages'
  | 'manage_roles'
  | 'mention_everyone'
  | 'mention_here'
  | 'mention_roles'
  | 'reject_members'
  | 'send_messages'
  | 'send_stickers'
  | 'view_channels';

const permissions: Record<string, CommunityPermissionValue> = {
  APPROVE_MEMBERS: 'approve_members',
  ATTACH_FILES: 'attach_files',
  BAN_MEMBERS: 'ban_members',
  CONNECT_VOICE: 'connect_voice',
  CREATE_INVITES: 'create_invites',
  CREATE_POLLS: 'create_polls',
  EMBED_LINKS: 'embed_links',
  MANAGE_CHANNELS: 'manage_channels',
  MANAGE_MEMBERS: 'manage_members',
  MANAGE_MESSAGES: 'manage_messages',
  MANAGE_ROLES: 'manage_roles',
  MENTION_EVERYONE: 'mention_everyone',
  MENTION_HERE: 'mention_here',
  MENTION_ROLES: 'mention_roles',
  REJECT_MEMBERS: 'reject_members',
  SEND_MESSAGES: 'send_messages',
  SEND_STICKERS: 'send_stickers',
  VIEW_CHANNELS: 'view_channels',
};

export class CommunityPermission extends Enum<CommunityPermissionValue> {
  public static readonly APPROVE_MEMBERS = new CommunityPermission(
    permissions.APPROVE_MEMBERS,
  );

  public static readonly ATTACH_FILES = new CommunityPermission(
    permissions.ATTACH_FILES,
  );

  public static readonly BAN_MEMBERS = new CommunityPermission(
    permissions.BAN_MEMBERS,
  );

  public static readonly CONNECT_VOICE = new CommunityPermission(
    permissions.CONNECT_VOICE,
  );

  public static readonly CREATE_INVITES = new CommunityPermission(
    permissions.CREATE_INVITES,
  );

  public static readonly CREATE_POLLS = new CommunityPermission(
    permissions.CREATE_POLLS,
  );

  public static readonly EMBED_LINKS = new CommunityPermission(
    permissions.EMBED_LINKS,
  );

  public static readonly MANAGE_CHANNELS = new CommunityPermission(
    permissions.MANAGE_CHANNELS,
  );

  public static readonly MANAGE_MEMBERS = new CommunityPermission(
    permissions.MANAGE_MEMBERS,
  );

  public static readonly MANAGE_MESSAGES = new CommunityPermission(
    permissions.MANAGE_MESSAGES,
  );

  public static readonly MANAGE_ROLES = new CommunityPermission(
    permissions.MANAGE_ROLES,
  );

  public static readonly MENTION_EVERYONE = new CommunityPermission(
    permissions.MENTION_EVERYONE,
  );

  public static readonly MENTION_HERE = new CommunityPermission(
    permissions.MENTION_HERE,
  );

  public static readonly MENTION_ROLES = new CommunityPermission(
    permissions.MENTION_ROLES,
  );

  public static readonly REJECT_MEMBERS = new CommunityPermission(
    permissions.REJECT_MEMBERS,
  );

  public static readonly SEND_MESSAGES = new CommunityPermission(
    permissions.SEND_MESSAGES,
  );

  public static readonly SEND_STICKERS = new CommunityPermission(
    permissions.SEND_STICKERS,
  );

  public static readonly VIEW_CHANNELS = new CommunityPermission(
    permissions.VIEW_CHANNELS,
  );

  public static basicMemberPermissions(): CommunityPermission[] {
    return [
      CommunityPermission.ATTACH_FILES,
      CommunityPermission.CONNECT_VOICE,
      CommunityPermission.EMBED_LINKS,
      CommunityPermission.SEND_MESSAGES,
      CommunityPermission.SEND_STICKERS,
      CommunityPermission.VIEW_CHANNELS,
    ];
  }

  public getValues(): CommunityPermissionValue[] {
    return Object.values(permissions);
  }
}
