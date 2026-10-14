/**
 * How many content bytes this node fetches and provides for one network,
 * across every owner. Local policy: it never changes which registrations are
 * valid nor which nodes are responsible for them.
 */
export class ContentReplicationNetworkBudget {
  public static readonly DEFAULT_BYTES = 32 * 1024 ** 3;

  constructor(public readonly bytes: number) {}
}
