import { CommunityPermissionValue } from './CommunityPermissionValue';

export const CommunityPermissions: Record<string, CommunityPermissionValue> = {
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
