import { PrimitiveOf } from '@haskou/value-objects';

import { NodeRelayPort } from './value-objects/NodeRelayPort';

export class NodeCallsRelayConfiguration {
  public static default(): NodeCallsRelayConfiguration {
    return NodeCallsRelayConfiguration.fromPrimitives();
  }

  public static fromPrimitives(
    primitives?: Partial<PrimitiveOf<NodeCallsRelayConfiguration>>,
  ): NodeCallsRelayConfiguration {
    return new NodeCallsRelayConfiguration(
      primitives?.port !== undefined
        ? new NodeRelayPort(primitives.port)
        : undefined,
    );
  }

  public constructor(private readonly port: NodeRelayPort | undefined) {}

  private isSamePort(
    port: NodeRelayPort | undefined,
    otherPort: NodeRelayPort | undefined,
  ): boolean {
    if (port === undefined || otherPort === undefined) {
      return port === otherPort;
    }

    return port.isEqual(otherPort);
  }

  public isEqual(other: NodeCallsRelayConfiguration): boolean {
    return this.isSamePort(this.port, other.port);
  }

  public toPrimitives() {
    return {
      port: this.port?.valueOf(),
    };
  }
}
