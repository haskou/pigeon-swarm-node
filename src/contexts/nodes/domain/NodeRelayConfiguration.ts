import type { NodeRelayConfigurationInput } from './NodeRelayConfigurationInput';

import { NodeCallsRelayConfiguration } from './NodeCallsRelayConfiguration';
import { NodePrivateRelayConfiguration } from './NodePrivateRelayConfiguration';
import { NodePublicRelayConfiguration } from './NodePublicRelayConfiguration';
import { NodeRelayMultiaddrs } from './value-objects/NodeRelayMultiaddrs';
import { NodeRelayPublicHost } from './value-objects/NodeRelayPublicHost';

export class NodeRelayConfiguration {
  private static publicRelayConfigurationFrom(
    primitives?: NodeRelayConfigurationInput,
  ): NodeRelayConfigurationInput['publicRelay'] {
    if (!primitives?.publicNetwork) {
      return primitives?.publicRelay;
    }

    return {
      discoveryEnabled: primitives.publicNetwork.enabled ?? false,
      enabled: primitives.publicNetwork.enabled ?? false,
      port: primitives.publicNetwork.port,
    };
  }

  public static default(): NodeRelayConfiguration {
    return NodeRelayConfiguration.fromPrimitives();
  }

  public static fromPrimitives(
    primitives?: NodeRelayConfigurationInput,
  ): NodeRelayConfiguration {
    return new NodeRelayConfiguration(
      primitives?.publicHost
        ? new NodeRelayPublicHost(primitives.publicHost)
        : undefined,
      NodeCallsRelayConfiguration.fromPrimitives(primitives?.callsRelay),
      NodePublicRelayConfiguration.fromPrimitives(
        NodeRelayConfiguration.publicRelayConfigurationFrom(primitives),
      ),
      NodePrivateRelayConfiguration.fromPrimitives(primitives?.privateRelay),
      NodeRelayMultiaddrs.fromPrimitives(primitives?.manualRelayMultiaddrs),
    );
  }

  constructor(
    private readonly publicHost: NodeRelayPublicHost | undefined,
    private readonly callsRelay: NodeCallsRelayConfiguration,
    private readonly publicRelay: NodePublicRelayConfiguration,
    private readonly privateRelay: NodePrivateRelayConfiguration,
    private readonly manualRelayMultiaddrs: NodeRelayMultiaddrs,
  ) {}

  private isSamePublicHost(
    publicHost: NodeRelayPublicHost | undefined,
    otherPublicHost: NodeRelayPublicHost | undefined,
  ): boolean {
    if (publicHost === undefined || otherPublicHost === undefined) {
      return publicHost === otherPublicHost;
    }

    return publicHost.isEqual(otherPublicHost);
  }

  public isEqual(other: NodeRelayConfiguration): boolean {
    return (
      this.isSamePublicHost(this.publicHost, other.publicHost) &&
      this.callsRelay.isEqual(other.callsRelay) &&
      this.publicRelay.isEqual(other.publicRelay) &&
      this.privateRelay.isEqual(other.privateRelay) &&
      this.manualRelayMultiaddrs.isEqual(other.manualRelayMultiaddrs)
    );
  }

  public toPrimitives() {
    return {
      callsRelay: this.callsRelay.toPrimitives(),
      manualRelayMultiaddrs: this.manualRelayMultiaddrs.toPrimitives(),
      privateRelay: this.privateRelay.toPrimitives(),
      publicHost: this.publicHost?.valueOf(),
      publicRelay: this.publicRelay.toPrimitives(),
    };
  }
}
