import { Node } from '@app/contexts/nodes/domain/Node';

import { NodeRelayConfigurationResource } from '../resources/NodeRelayConfigurationResource';

export class NodeRelayConfigurationViewModel {
  constructor(private readonly node: Node) {}

  public toResource(): NodeRelayConfigurationResource {
    return this.node.toPrimitives().relayConfiguration;
  }
}
