export interface MongoNodePeerDocument {
  _id: string;
  capabilities?: {
    contentFallback?: boolean;
    gossipsub?: boolean;
    privateIpfs?: boolean;
    privateIpfsPeerCount?: number;
    publicIpfs?: boolean;
    publicIpfsPeerCount?: number;
    relay?: boolean;
  };
  lastSeenAt: number;
  networks: Array<{
    id: string;
    name: string;
  }>;
  owner?: string;
}
