import { CommunityTextChannelResource } from './CommunityTextChannelResource';
import { CommunityVoiceChannelResource } from './CommunityVoiceChannelResource';

export type CommunityChannelResource =
  | CommunityTextChannelResource
  | CommunityVoiceChannelResource;

export interface CommunityChannelsResource {
  channels: CommunityChannelResource[];
}
