export type WebSocketClientMessage = {
  active?: boolean;
  channelId?: string;
  communityId?: string;
  conversationId?: string;
  scope?: string;
  signalId?: string;
  type?: string;
};
