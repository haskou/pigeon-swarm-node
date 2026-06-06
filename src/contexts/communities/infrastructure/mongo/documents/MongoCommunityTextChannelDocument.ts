import { MongoCommunityChannelPermissionsDocument } from './MongoCommunityChannelPermissionsDocument';

export interface MongoCommunityTextChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: MongoCommunityChannelPermissionsDocument;
  type: 'text';
}
