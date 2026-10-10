export type WebSocketClientMessage = {
  active?: boolean;
  channelId?: string;
  communityId?: string;
  conversationId?: string;
  mailboxId?: string;
  readToken?: string;
  scope?: string;
  signalId?: string;
  type?: string;
};
