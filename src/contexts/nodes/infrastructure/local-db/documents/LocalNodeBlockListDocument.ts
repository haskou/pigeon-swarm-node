import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';

export interface LocalNodeBlockListDocument extends Record<string, unknown> {
  _id: 'local';
  blockList: NodeBlockListPrimitives;
}
