import { NetworkReplicationStatus } from './NetworkReplicationStatus';

export type ReplicatedContentStatus = {
  cid: string;
  contentType: string;
  context: string;
  createdAt: number;
  filename?: string;
  networks: NetworkReplicationStatus[];
  ownerIdentityId: string;
  priority: string;
  sizeBytes: number;
  updatedAt: number;
};
