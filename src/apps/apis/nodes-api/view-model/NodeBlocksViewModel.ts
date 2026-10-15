import { NodeBlocks } from '@app/contexts/nodes/domain/NodeBlocks';

import { NodeBlocksResource } from '../resources/NodeBlocksResource';

export class NodeBlocksViewModel {
  constructor(private readonly blocks: NodeBlocks) {}

  public toResource(): NodeBlocksResource {
    return { blockList: this.blocks.toPrimitives() ?? null };
  }
}
