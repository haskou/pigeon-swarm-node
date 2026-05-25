import { CommunityInviteResource } from './CommunityInviteResource';

export type CommunityInviteDetailsResource = CommunityInviteResource & {
  communityAvatar?: string;
  communityBanner?: string;
  communityName: string;
};
