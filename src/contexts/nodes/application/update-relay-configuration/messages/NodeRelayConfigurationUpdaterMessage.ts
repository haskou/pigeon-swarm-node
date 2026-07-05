import type { NodeRelayConfigurationInput } from '@app/contexts/nodes/domain/NodeRelayConfigurationInput';

import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';

export class NodeRelayConfigurationUpdaterMessage {
  public readonly relayConfiguration: NodeRelayConfiguration;

  constructor(relayConfiguration: NodeRelayConfigurationInput = {}) {
    this.relayConfiguration =
      NodeRelayConfiguration.fromPrimitives(relayConfiguration);
  }
}
