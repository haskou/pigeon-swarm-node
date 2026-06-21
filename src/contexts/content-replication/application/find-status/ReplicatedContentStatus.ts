import { NetworkReplicationStatus } from './NetworkReplicationStatus';

export class ReplicatedContentStatus {
  public readonly cid!: string;
  public readonly contentType!: string;
  public readonly context!: string;
  public readonly createdAt!: number;
  public readonly filename?: string;
  public readonly networks!: NetworkReplicationStatus[];
  public readonly ownerIdentityId!: string;
  public readonly priority!: string;
  public readonly sizeBytes!: number;
  public readonly updatedAt!: number;
}
