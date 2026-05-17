import { IPFSContentReplicationPriorityValue } from '../../../domain/value-objects/IPFSContentReplicationPriority';

export interface MongoIPFSContentReplicationDocument {
  _id: string;
  context: string;
  createdAt: number;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: IPFSContentReplicationPriorityValue;
  sizeBytes: number;
  updatedAt: number;
}
