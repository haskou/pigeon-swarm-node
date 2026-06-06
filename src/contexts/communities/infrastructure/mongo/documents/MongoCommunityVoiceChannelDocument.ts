import { MongoCommunityChannelPermissionsDocument } from './MongoCommunityChannelPermissionsDocument';

export interface MongoCommunityVoiceChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: MongoCommunityChannelPermissionsDocument;
  type: 'voice';
}
