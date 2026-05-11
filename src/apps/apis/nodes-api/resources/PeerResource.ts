export type PeerResource = {
  id: string;
  lastSeenAt: number;
  networks: Array<{
    id: string;
    name: string;
  }>;
  owner?: string;
};
