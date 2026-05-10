import { Node } from '@app/contexts/nodes/domain/Node';

import { NodeResource } from '../resources/NodeResource';

export class NodeViewModel {
  constructor(private readonly node: Node) {}

  public toResource(): NodeResource {
    const primitives = this.node.toPrimitives();

    return {
      id: primitives.id,
      owner: primitives.owner,
    };
  }
}
