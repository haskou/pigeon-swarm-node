import {
  CommunityTextChannelResource,
  CommunityVoiceChannelResource,
} from './CommunityResource';

export type CommunityChannelResource =
  | CommunityTextChannelResource
  | CommunityVoiceChannelResource;

export interface CommunityChannelsResource {
  channels: CommunityChannelResource[];
}
