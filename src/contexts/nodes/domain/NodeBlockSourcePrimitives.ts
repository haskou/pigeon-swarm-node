import { NodeBlockEntriesPrimitives } from './NodeBlockEntriesPrimitives';
import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlockSourceFetchPrimitives } from './NodeBlockSourceFetchPrimitives';

export interface NodeBlockSourcePrimitives {
  approved: NodeBlockEntriesPrimitives;
  autoApply: boolean;
  lastFetch: NodeBlockSourceFetchPrimitives | null;
  list: NodeBlockListPrimitives | null;
  origin: string;
  ownerIdentityId: string;
}
