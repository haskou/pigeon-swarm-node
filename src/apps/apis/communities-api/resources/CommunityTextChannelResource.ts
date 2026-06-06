import { CommunityChannelPermissionsResource } from './CommunityChannelPermissionsResource';
import { CommunityChannelThreadSummaryResource } from './CommunityChannelThreadSummaryResource';

export interface CommunityTextChannelResource {
  createdAt: number;
  id: string;
  name: string;
  permissions: CommunityChannelPermissionsResource;
  threads?: CommunityChannelThreadSummaryResource[];
  type: 'text';
}
