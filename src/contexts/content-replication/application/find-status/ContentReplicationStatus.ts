import { ReplicatedContentStatus } from './ReplicatedContentStatus';

export class ContentReplicationStatus {
  public readonly contents!: ReplicatedContentStatus[];
  public readonly localNodeId!: string;
}
