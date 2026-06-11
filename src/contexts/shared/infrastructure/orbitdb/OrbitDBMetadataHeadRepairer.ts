import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

type RepairResult = {
  communities: number;
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

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = document[attribute];

    return this.isStringArray(value) ? value : [];
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

  private communityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return this.stringValue(document, 'id');
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

  private isLiveCommunityDocument(document: Record<string, unknown>): boolean {
    return document.deleted !== true && Boolean(this.communityIdFrom(document));
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

  private communityDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    const communities = record?.communities;

    if (!Array.isArray(communities)) {
      return [];
    }

    return communities.filter(
      (community): community is Record<string, unknown> =>
        typeof community === 'object' &&
        community !== null &&
        !Array.isArray(community),
    );
  }

  private putIndexedCommunity(
    documents: Record<string, unknown>[],
    community: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const communityId = this.communityIdFrom(community);

    if (!communityId) {
      return documents;
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const document of documents) {
      const documentId = this.communityIdFrom(document);

      if (documentId) {
        merged.set(documentId, document);
      }
    }

    merged.set(communityId, community);

    return [...merged.values()];
  }

  private async putCommunityMemberIndex(
    memberId: string,
    community: Record<string, unknown>,
  ): Promise<void> {
    const key = `community-member-index:${memberId}`;
    const communities = this.putIndexedCommunity(
      this.communityDocumentsFromIndex(await this.registry.findHead(key)),
      community,
    ).filter((document) =>
      this.stringArrayValue(document, 'memberIds').includes(memberId),
    );

    await this.registry.putHead(key, {
      communities,
      id: key,
      memberId,
      updatedAt: Date.now(),
    });
  }

  private async repairCommunityHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'communities',
      (document) => this.isLiveCommunityDocument(document),
    );

    for (const document of documents) {
      const communityId = this.communityIdFrom(document);

      if (!communityId) {
        continue;
      }

      await this.registry.putHead(
        `community:${communityId}`,
        document,
        this.networkIdsFrom(document),
      );

      await Promise.all(
        this.stringArrayValue(document, 'memberIds').map((memberId) =>
          this.putCommunityMemberIndex(memberId, document),
        ),
      );
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
    const [communities, identities, keychains] = await Promise.all([
      this.repairCommunityHeads(),
      this.repairIdentityHeads(),
      this.repairKeychainHeads(),
    ]);

    return { communities, identities, keychains };
  }
}
