import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';

export class NodeBlockListStorerMessage {
  public readonly blockList: NodeBlockList;

  constructor(blockList: NodeBlockListPrimitives) {
    this.blockList = NodeBlockList.fromPrimitives(blockList);
  }
}
