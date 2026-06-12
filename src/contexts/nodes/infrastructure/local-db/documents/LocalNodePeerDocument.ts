export interface LocalNodePeerDocument extends Record<string, unknown> {
  _id: string;
  lastSeenAt: number;
  networks: Array<{
    id: string;
    name: string;
  }>;
  owner?: string;
}
