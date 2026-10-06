import { NetworkReplicationStatus } from './NetworkReplicationStatus';

export class ReplicatedContentStatus {
  public readonly cid!: string;
  public readonly context!: string;
  public readonly networks!: NetworkReplicationStatus[];
  public readonly sizeBytes!: number;
}
