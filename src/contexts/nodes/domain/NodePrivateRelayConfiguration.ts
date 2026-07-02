import { assert, PrimitiveOf } from '@haskou/value-objects';

import { InvalidNodeRelayPortRangeError } from './errors/InvalidNodeRelayPortRangeError';
import { NodeRelayPortRangeRequiredError } from './errors/NodeRelayPortRangeRequiredError';
import { NodeRelayPort } from './value-objects/NodeRelayPort';

export class NodePrivateRelayConfiguration {
  private static optionalPort(port?: number): NodeRelayPort | undefined {
    return port === undefined ? undefined : new NodeRelayPort(port);
  }

  public static default(): NodePrivateRelayConfiguration {
    return NodePrivateRelayConfiguration.fromPrimitives();
  }

  public static fromPrimitives(
    primitives?: Partial<PrimitiveOf<NodePrivateRelayConfiguration>>,
  ): NodePrivateRelayConfiguration {
    const {
      enabled = false,
      portEnd,
      portStart,
      publicRecordDiscoveryEnabled = false,
      publicRecordPublicationEnabled = false,
    } = primitives ?? {};

    return new NodePrivateRelayConfiguration(
      enabled,
      NodePrivateRelayConfiguration.optionalPort(portStart),
      NodePrivateRelayConfiguration.optionalPort(portEnd),
      publicRecordPublicationEnabled,
      publicRecordDiscoveryEnabled,
    );
  }

  constructor(
    private readonly enabled: boolean,
    private readonly portStart: NodeRelayPort | undefined,
    private readonly portEnd: NodeRelayPort | undefined,
    private readonly publicRecordPublicationEnabled: boolean,
    private readonly publicRecordDiscoveryEnabled: boolean,
  ) {
    this.assertValidPortRange();
  }

  private assertValidPortRange(): void {
    assert(
      !this.enabled ||
        (this.portStart !== undefined && this.portEnd !== undefined),
      new NodeRelayPortRangeRequiredError(),
    );

    if (this.portStart === undefined || this.portEnd === undefined) {
      return;
    }

    assert(
      !this.portEnd.isBefore(this.portStart),
      new InvalidNodeRelayPortRangeError(
        this.portStart.valueOf(),
        this.portEnd.valueOf(),
      ),
    );
  }

  private isSamePort(
    port: NodeRelayPort | undefined,
    otherPort: NodeRelayPort | undefined,
  ): boolean {
    if (port === undefined || otherPort === undefined) {
      return port === otherPort;
    }

    return port.isEqual(otherPort);
  }

  public isEqual(other: NodePrivateRelayConfiguration): boolean {
    return (
      this.enabled === other.enabled &&
      this.isSamePort(this.portStart, other.portStart) &&
      this.isSamePort(this.portEnd, other.portEnd) &&
      this.publicRecordPublicationEnabled ===
        other.publicRecordPublicationEnabled &&
      this.publicRecordDiscoveryEnabled === other.publicRecordDiscoveryEnabled
    );
  }

  public toPrimitives() {
    return {
      enabled: this.enabled,
      portEnd: this.portEnd?.valueOf(),
      portStart: this.portStart?.valueOf(),
      publicRecordDiscoveryEnabled: this.publicRecordDiscoveryEnabled,
      publicRecordPublicationEnabled: this.publicRecordPublicationEnabled,
    };
  }
}
