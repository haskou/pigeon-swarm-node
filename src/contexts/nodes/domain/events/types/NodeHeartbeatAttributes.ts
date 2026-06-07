export type NodeHeartbeatAttributes = {
  networks: Array<{
    id: string;
    multiaddrs?: string[];
    name: string;
    peerId?: string;
  }>;
  owner?: string;
};
