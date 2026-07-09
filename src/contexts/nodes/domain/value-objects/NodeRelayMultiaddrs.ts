import { NodeRelayMultiaddr } from './NodeRelayMultiaddr';

export class NodeRelayMultiaddrs {
  public static fromPrimitives(multiaddrs: string[] = []): NodeRelayMultiaddrs {
    return new NodeRelayMultiaddrs(
      multiaddrs.map((multiaddr) => new NodeRelayMultiaddr(multiaddr)),
    );
  }

  constructor(private readonly multiaddrs: NodeRelayMultiaddr[] = []) {}

  public isEqual(other: NodeRelayMultiaddrs): boolean {
    return (
      this.multiaddrs.length === other.multiaddrs.length &&
      this.multiaddrs.every((multiaddr, index) =>
        multiaddr.isEqual(other.multiaddrs[index]),
      )
    );
  }

  public toPrimitives(): string[] {
    return this.multiaddrs.map((multiaddr) => multiaddr.valueOf());
  }
}
