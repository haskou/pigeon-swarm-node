export interface MongoNodePeerDocument {
  _id: string;
  lastSeenAt: number;
  networks: Array<{
    id: string;
    name: string;
  }>;
  owner?: string;
}
