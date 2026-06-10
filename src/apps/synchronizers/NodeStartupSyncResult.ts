export interface NodeStartupSyncResult {
  communityRequests: number;
  connectedPeerCount: number;
  conversationRequests: number;
  identityNetworkRequests: number;
  identityRequests: number;
  keychainRequests: number;
  networkIds: string[];
  omittedRequests: number;
  publishedEvents: number;
  requestId: string;
  requesterNodeId: string;
  totalRequests: number;
}
