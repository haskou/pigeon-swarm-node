import { OrbitDBCommunityChannelPermissionsDocument } from './OrbitDBCommunityChannelPermissionsDocument';

export interface OrbitDBCommunityTextChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: OrbitDBCommunityChannelPermissionsDocument;
  type: 'text';
}
