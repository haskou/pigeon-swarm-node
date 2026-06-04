export type WebSocketRealtimeMessage =
  | {
      identityId: string;
      type: 'connection_ack';
    }
  | {
      identityId: string;
      timestamp: number;
      type: 'heartbeat_ack';
    }
  | {
      event: unknown;
      type: 'domain_event';
    }
  | {
      active: boolean;
      conversationId: string;
      identityId: string;
      scope: 'conversation';
      timestamp: number;
      type: 'typing';
    }
  | {
      active: boolean;
      channelId: string;
      communityId: string;
      identityId: string;
      scope: 'community_channel';
      timestamp: number;
      type: 'typing';
    };
