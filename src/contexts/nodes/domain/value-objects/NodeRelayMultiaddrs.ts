import { NodeRelayMultiaddr } from './NodeRelayMultiaddr';

export class NodeRelayMultiaddrs {
  public static fromPrimitives(multiaddrs: string[] = []): NodeRelayMultiaddrs {
    return new NodeRelayMultiaddrs(
      multiaddrs.map((multiaddr) => new NodeRelayMultiaddr(multiaddr)),
    );
  }

  constructor(private readonly multiaddrs: NodeRelayMultiaddr[] = []) {}

  public isEqual(other: NodeRelayMultiaddrs): boolean {
    const current = this.toPrimitives();
    const next = other.toPrimitives();

    return (
      current.length === next.length &&
      current.every((multiaddr, index) => multiaddr === next[index])
    );
  }

  public toPrimitives(): string[] {
    return this.multiaddrs.map((multiaddr) => multiaddr.valueOf());
  }
}
