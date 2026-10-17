import type { NodeRelayConfigurationInput } from '@app/contexts/nodes/domain/NodeRelayConfigurationInput';

import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeRelayConfigurationUpdaterMessage {
  public readonly relayConfiguration: NodeRelayConfiguration;
  /** Undefined while nobody claimed the node. */
  public readonly authenticatedIdentityId?: IdentityId;

  constructor(
    relayConfiguration: NodeRelayConfigurationInput,
    authenticatedIdentityId: string | undefined,
  ) {
    this.relayConfiguration =
      NodeRelayConfiguration.fromPrimitives(relayConfiguration);
    this.authenticatedIdentityId =
      authenticatedIdentityId === undefined
        ? undefined
        : new IdentityId(authenticatedIdentityId);
  }
}
