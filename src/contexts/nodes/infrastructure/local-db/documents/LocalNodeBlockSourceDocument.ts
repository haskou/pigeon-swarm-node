import { NodeBlockSourcePrimitives } from '@app/contexts/nodes/domain/NodeBlockSourcePrimitives';

export interface LocalNodeBlockSourceDocument extends Record<string, unknown> {
  _id: string;
  source: NodeBlockSourcePrimitives;
}
