import { CommunityChannelPermissionsResource } from './CommunityChannelPermissionsResource';

export interface CommunityVoiceChannelResource {
  connectedIdentityIds?: string[];
  createdAt: number;
  id: string;
  name: string;
  permissions: CommunityChannelPermissionsResource;
  type: 'voice';
}
