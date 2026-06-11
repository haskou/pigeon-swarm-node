import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

type RepairResult = {
  identities: number;
  keychains: number;
};

export default class OrbitDBMetadataHeadRepairer {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'identityId') ||
      this.stringValue(document, 'id')
    );
  }

  private ownerIdentityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id')
    );
  }

  private networkIdsFrom(document: Record<string, unknown>): string[] {
    const networkIds = this.isStringArray(document.networkIds)
      ? document.networkIds
      : [];
    const networkId = this.stringValue(document, 'networkId');

    return [...new Set([...networkIds, ...(networkId ? [networkId] : [])])];
  }

  private isLiveDocument(document: Record<string, unknown>): boolean {
    return (
      document.deleted !== true && Boolean(this.stringValue(document, 'cid'))
    );
  }

  private async repairIdentityHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) =>
        this.isLiveDocument(document) && Boolean(this.identityIdFrom(document)),
    );

    for (const document of documents) {
      const identityId = this.identityIdFrom(document);

      if (!identityId) {
        continue;
      }

      const networkIds = this.networkIdsFrom(document);

      await this.registry.putHead(
        `identity:${identityId}`,
        document,
        networkIds,
      );

      const handle = this.stringValue(document, 'handle');

      if (handle) {
        await this.registry.putHead(
          `identity-handle:${handle}`,
          document,
          networkIds,
        );
      }
    }

    return documents.length;
  }

  private async repairKeychainHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'keychains',
      (document) =>
        this.isLiveDocument(document) &&
        Boolean(this.ownerIdentityIdFrom(document)),
    );

    for (const document of documents) {
      const ownerIdentityId = this.ownerIdentityIdFrom(document);

      if (!ownerIdentityId) {
        continue;
      }

      await this.registry.putHead(`keychain:${ownerIdentityId}`, document);
    }

    return documents.length;
  }

  public async repair(): Promise<RepairResult> {
    const [identities, keychains] = await Promise.all([
      this.repairIdentityHeads(),
      this.repairKeychainHeads(),
    ]);

    return { identities, keychains };
  }
}
