import { OrbitDBDocumentDeduplicator } from './OrbitDBDocumentDeduplicator';
import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

export default class OrbitDBIdentityMetadataHeadRepairer {
  private readonly deduplicator = new OrbitDBDocumentDeduplicator<
    Record<string, unknown>
  >({
    recordId: (document) => this.identityIdFrom(document),
    shouldReplace: (current, candidate) =>
      this.isNewerDocument(current, candidate),
  });

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private hasConflictingIdentityIds(
    identityId: string | undefined,
    embeddedIdentityId: string | undefined,
  ): boolean {
    return Boolean(
      identityId && embeddedIdentityId && identityId !== embeddedIdentityId,
    );
  }

  private isProjectedIdentityRecord(
    document: Record<string, unknown>,
  ): boolean {
    return (
      Boolean(this.stringValue(document, 'cid')) &&
      Boolean(this.stringValue(document, 'id')) &&
      Boolean(this.stringValue(document, 'lastEventId'))
    );
  }

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    const identityId = this.stringValue(document, 'identityId');
    const identity = this.isRecord(document.identity)
      ? document.identity
      : undefined;
    const embeddedIdentityId = identity
      ? this.stringValue(identity, 'id')
      : undefined;
    const projectedIdentityId = this.isProjectedIdentityRecord(document)
      ? this.stringValue(document, 'id')
      : undefined;

    if (this.hasConflictingIdentityIds(identityId, embeddedIdentityId)) {
      return undefined;
    }

    return identityId || embeddedIdentityId || projectedIdentityId;
  }

  private networkIdsFrom(document: Record<string, unknown>): string[] {
    const networkIds = Array.isArray(document.networkIds)
      ? document.networkIds.filter(
          (networkId): networkId is string => typeof networkId === 'string',
        )
      : [];
    const networkId = this.stringValue(document, 'networkId');

    return [...new Set([...networkIds, ...(networkId ? [networkId] : [])])];
  }

  private documentFreshness(document: Record<string, unknown>): number {
    return Math.max(
      ...['deletedAt', 'receivedAt', 'updatedAt', 'createdAt']
        .map((attribute) => this.numberValue(document, attribute))
        .filter((value): value is number => value !== undefined),
      0,
    );
  }

  private documentVersion(document: Record<string, unknown>): number {
    return this.numberValue(document, 'version') || 0;
  }

  private isNewerDocument(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentVersion = this.documentVersion(current);
    const candidateVersion = this.documentVersion(candidate);

    if (currentVersion !== candidateVersion) {
      return currentVersion < candidateVersion;
    }

    return this.documentFreshness(current) <= this.documentFreshness(candidate);
  }

  private isLiveIdentityDocument(document: Record<string, unknown>): boolean {
    return (
      document.deleted !== true &&
      Boolean(this.stringValue(document, 'cid')) &&
      Boolean(this.identityIdFrom(document))
    );
  }

  public async repair(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) => this.isLiveIdentityDocument(document),
      {
        mode: 'repair',
        operation: 'OrbitDBIdentityMetadataHeadRepairer.repair',
      },
    );
    const latestDocuments = this.deduplicator.deduplicate(documents);

    for (const document of latestDocuments) {
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

    return latestDocuments.length;
  }
}
