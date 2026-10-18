import { CommunityResource } from './CommunityResource';

export interface CommunitiesResource {
  communities: CommunityResource[];
  nextCursor: string | null;
}
