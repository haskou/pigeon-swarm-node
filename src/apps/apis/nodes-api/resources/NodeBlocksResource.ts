import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';

export interface NodeBlocksResource {
  blockList: NodeBlockListPrimitives | null;
}
