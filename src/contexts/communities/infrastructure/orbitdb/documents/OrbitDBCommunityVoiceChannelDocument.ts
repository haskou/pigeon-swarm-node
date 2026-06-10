import { OrbitDBCommunityChannelPermissionsDocument } from './OrbitDBCommunityChannelPermissionsDocument';

export interface OrbitDBCommunityVoiceChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: OrbitDBCommunityChannelPermissionsDocument;
  type: 'voice';
}
