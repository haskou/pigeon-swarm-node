import { Enum } from '@haskou/value-objects';

const CommunityPermissions = {
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
} as const;

export class CommunityPermission extends Enum<string> {
  public static readonly APPROVE_MEMBERS = new CommunityPermission(
    CommunityPermissions.APPROVE_MEMBERS,
  );

  public static readonly ATTACH_FILES = new CommunityPermission(
    CommunityPermissions.ATTACH_FILES,
  );

  public static readonly BAN_MEMBERS = new CommunityPermission(
    CommunityPermissions.BAN_MEMBERS,
  );

  public static readonly CONNECT_VOICE = new CommunityPermission(
    CommunityPermissions.CONNECT_VOICE,
  );

  public static readonly CREATE_INVITES = new CommunityPermission(
    CommunityPermissions.CREATE_INVITES,
  );

  public static readonly CREATE_POLLS = new CommunityPermission(
    CommunityPermissions.CREATE_POLLS,
  );

  public static readonly EMBED_LINKS = new CommunityPermission(
    CommunityPermissions.EMBED_LINKS,
  );

  public static readonly MANAGE_CHANNELS = new CommunityPermission(
    CommunityPermissions.MANAGE_CHANNELS,
  );

  public static readonly MANAGE_MEMBERS = new CommunityPermission(
    CommunityPermissions.MANAGE_MEMBERS,
  );

  public static readonly MANAGE_MESSAGES = new CommunityPermission(
    CommunityPermissions.MANAGE_MESSAGES,
  );

  public static readonly MANAGE_ROLES = new CommunityPermission(
    CommunityPermissions.MANAGE_ROLES,
  );

  public static readonly MENTION_EVERYONE = new CommunityPermission(
    CommunityPermissions.MENTION_EVERYONE,
  );

  public static readonly MENTION_HERE = new CommunityPermission(
    CommunityPermissions.MENTION_HERE,
  );

  public static readonly MENTION_ROLES = new CommunityPermission(
    CommunityPermissions.MENTION_ROLES,
  );

  public static readonly REJECT_MEMBERS = new CommunityPermission(
    CommunityPermissions.REJECT_MEMBERS,
  );

  public static readonly SEND_MESSAGES = new CommunityPermission(
    CommunityPermissions.SEND_MESSAGES,
  );

  public static readonly SEND_STICKERS = new CommunityPermission(
    CommunityPermissions.SEND_STICKERS,
  );

  public static readonly VIEW_CHANNELS = new CommunityPermission(
    CommunityPermissions.VIEW_CHANNELS,
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

  public getValues(): string[] {
    return Object.values(CommunityPermissions);
  }
}
