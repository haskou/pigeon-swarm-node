import { Node } from '@app/contexts/nodes/domain/Node';

import { NodeRelayConfigurationResource } from '../resources/NodeRelayConfigurationResource';

export class NodeRelayConfigurationViewModel {
  constructor(private readonly node: Node) {}

  public toResource(): NodeRelayConfigurationResource {
    const relayConfiguration = this.node.toPrimitives().relayConfiguration;
    const privateRelay = relayConfiguration.privateRelay;

    return {
      callsRelay: relayConfiguration.callsRelay,
      manualRelayMultiaddrs: relayConfiguration.manualRelayMultiaddrs,
      privateRelay: {
        discoveryEnabled: privateRelay.publicRecordDiscoveryEnabled,
        enabled: privateRelay.enabled,
        portEnd: privateRelay.portEnd,
        portStart: privateRelay.portStart,
        publicationEnabled: privateRelay.publicRecordPublicationEnabled,
      },
      publicHost: relayConfiguration.publicHost,
    };
  }
}
