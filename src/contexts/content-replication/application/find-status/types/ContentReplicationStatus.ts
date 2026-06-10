import { ReplicatedContentStatus } from './ReplicatedContentStatus';

export type ContentReplicationStatus = {
  contents: ReplicatedContentStatus[];
  localNodeId: string;
};
