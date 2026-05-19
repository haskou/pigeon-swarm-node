import { IPFSContentReplicationPriorityValue } from '../../../domain/value-objects/IPFSContentReplicationPriority';

export interface MongoIPFSContentReplicationDocument {
  _id: string;
  contentType?: string;
  context: string;
  createdAt: number;
  filename?: string;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: IPFSContentReplicationPriorityValue;
  sizeBytes: number;
  updatedAt: number;
}
