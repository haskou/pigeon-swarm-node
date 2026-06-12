import { PriorityValue } from '../../../domain/value-objects/types/PriorityValue';

export interface OrbitDBContentReplicationDocument {
  cid: string;
  contentType?: string;
  context: string;
  createdAt: number;
  filename?: string;
  id: string;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: PriorityValue;
  sizeBytes: number;
  updatedAt: number;
}
