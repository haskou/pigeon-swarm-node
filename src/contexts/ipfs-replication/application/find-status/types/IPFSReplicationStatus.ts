import { IPFSContentReplicationStatus } from './IPFSContentReplicationStatus';

export type IPFSReplicationStatus = {
  contents: IPFSContentReplicationStatus[];
  localNodeId: string;
};
