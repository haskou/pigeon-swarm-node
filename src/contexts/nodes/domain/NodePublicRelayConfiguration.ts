import { PrimitiveOf } from '@haskou/value-objects';

import { NodeRelayPort } from './value-objects/NodeRelayPort';

export class NodePublicRelayConfiguration {
  private static readonly DEFAULT_LIBP2P_PORT = 4001;
  private static readonly DEFAULT_RELAY_PORT = 4011;

  public static default(): NodePublicRelayConfiguration {
    return NodePublicRelayConfiguration.fromPrimitives();
  }

  public static fromPrimitives(
    primitives?: Partial<PrimitiveOf<NodePublicRelayConfiguration>>,
  ): NodePublicRelayConfiguration {
    const {
      autoEnabled = false,
      discoveryEnabled = false,
      enabled = false,
      libp2pPort = NodePublicRelayConfiguration.DEFAULT_LIBP2P_PORT,
      port = NodePublicRelayConfiguration.DEFAULT_RELAY_PORT,
    } = primitives ?? {};

    return new NodePublicRelayConfiguration(
      enabled,
      autoEnabled,
      discoveryEnabled,
      new NodeRelayPort(port),
      new NodeRelayPort(libp2pPort),
    );
  }

  constructor(
    private readonly enabled: boolean,
    private readonly autoEnabled: boolean,
    private readonly discoveryEnabled: boolean,
    private readonly port: NodeRelayPort,
    private readonly libp2pPort: NodeRelayPort,
  ) {}

  public isEqual(other: NodePublicRelayConfiguration): boolean {
    return (
      this.enabled === other.enabled &&
      this.autoEnabled === other.autoEnabled &&
      this.discoveryEnabled === other.discoveryEnabled &&
      this.port.isEqual(other.port) &&
      this.libp2pPort.isEqual(other.libp2pPort)
    );
  }

  public toPrimitives() {
    return {
      autoEnabled: this.autoEnabled,
      discoveryEnabled: this.discoveryEnabled,
      enabled: this.enabled,
      libp2pPort: this.libp2pPort.valueOf(),
      port: this.port.valueOf(),
    };
  }
}
