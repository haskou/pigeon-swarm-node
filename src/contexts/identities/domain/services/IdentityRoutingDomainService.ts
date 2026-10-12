export interface DeclaresNetworks {
  networkIds?: string[];
}

/**
 * Decides on which networks an identity's routing records are published.
 */
export default class IdentityRoutingDomainService {
  private declaredNetworkIds(document: DeclaresNetworks): string[] {
    return [...new Set(document.networkIds ?? [])];
  }

  private isRequested(networkId: string, requestedNetworkId?: string): boolean {
    return !requestedNetworkId || networkId === requestedNetworkId;
  }

  /**
   * The distinct networks declared by any document, narrowed to the requested
   * network when one is given. These are the networks the transport must check.
   */
  public networksToCheck(
    documents: DeclaresNetworks[],
    requestedNetworkId?: string,
  ): string[] {
    const networkIds = new Set(
      documents.flatMap((document) => this.declaredNetworkIds(document)),
    );

    return [...networkIds].filter((networkId) =>
      this.isRequested(networkId, requestedNetworkId),
    );
  }

  /**
   * The networks a document is republished on: declared, connected and requested.
   */
  public republishNetworkIds(
    document: DeclaresNetworks,
    connectedNetworkIds: ReadonlySet<string>,
    requestedNetworkId?: string,
  ): string[] {
    return this.declaredNetworkIds(document).filter(
      (networkId) =>
        connectedNetworkIds.has(networkId) &&
        this.isRequested(networkId, requestedNetworkId),
    );
  }
}
