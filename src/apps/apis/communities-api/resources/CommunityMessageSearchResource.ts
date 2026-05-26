import { CommunityChannelMessageResource } from './CommunityChannelMessageResource';

export interface CommunityMessageSearchResource {
  communityId: string;
  messages: CommunityChannelMessageResource[];
}
