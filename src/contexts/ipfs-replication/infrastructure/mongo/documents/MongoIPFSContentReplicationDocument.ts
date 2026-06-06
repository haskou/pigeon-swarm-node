import { PriorityValue } from '../../../domain/value-objects/types/PriorityValue';

export interface MongoIPFSContentReplicationDocument {
  _id: string;
  contentType?: string;
  context: string;
  createdAt: number;
  filename?: string;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: PriorityValue;
  sizeBytes: number;
  updatedAt: number;
}
