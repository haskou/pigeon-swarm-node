import { NodeBlockEntriesPrimitives } from '@app/contexts/nodes/domain/NodeBlockEntriesPrimitives';

export interface LocalNodeBlockExceptionsDocument extends Record<
  string,
  unknown
> {
  _id: 'local';
  exceptions: NodeBlockEntriesPrimitives;
}
