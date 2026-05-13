export type CommunityChannelCallEventType = 'declined' | 'ended' | 'missed';

export interface CommunityChannelCallEventResource {
  actorIdentityId: string;
  callEventType: CommunityChannelCallEventType;
  callId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  durationMs: number;
  id: string;
  type: 'call_event';
}
