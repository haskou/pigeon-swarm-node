import { Node } from '@app/contexts/nodes/domain/Node';

import { NodeRegistrationResource } from '../resources/NodeRegistrationResource';

export class NodeRegistrationViewModel {
  constructor(private readonly node: Node) {}

  public toResource(): NodeRegistrationResource {
    return { mode: this.node.toPrimitives().registrationMode };
  }
}
