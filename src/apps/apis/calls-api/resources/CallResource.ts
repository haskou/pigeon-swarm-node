import { CallParticipantMediaConnectionResource } from './CallParticipantMediaConnectionResource';

export interface CallResource {
  createdAt: number;
  creatorIdentityId: string;
  endedAt?: number;
  endedByIdentityId?: string;
  id: string;
  networkId: string;
  participantIds: string[];
  participants: Array<{
    connected: boolean;
    declinedAt?: number;
    identityId: string;
    joinedAt?: number;
    lastHeartbeatAt?: number;
    leftAt?: number;
    mediaConnections: CallParticipantMediaConnectionResource[];
    missedAt?: number;
    status: string;
  }>;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  status: string;
}
