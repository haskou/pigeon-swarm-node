import { OrbitDBDocumentDeduplicator } from './OrbitDBDocumentDeduplicator';
import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

export default class OrbitDBKeychainMetadataHeadRepairer {
  private readonly deduplicator = new OrbitDBDocumentDeduplicator<
    Record<string, unknown>
  >({
    recordId: (document) => this.ownerIdentityIdFrom(document),
    shouldReplace: (current, candidate) =>
      this.isNewerDocument(current, candidate),
  });

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

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

  private ownerIdentityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id')
    );
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

  private isLiveKeychainDocument(document: Record<string, unknown>): boolean {
    return (
      document.deleted !== true &&
      Boolean(this.stringValue(document, 'cid')) &&
      Boolean(this.ownerIdentityIdFrom(document))
    );
  }

  public async repair(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'keychains',
      (document) => this.isLiveKeychainDocument(document),
      {
        mode: 'repair',
        operation: 'OrbitDBKeychainMetadataHeadRepairer.repair',
      },
    );

    for (const document of documents) {
      const cid = this.stringValue(document, 'cid');

      if (cid) {
        await this.registry.putHead(`keychain-cid:${cid}`, document);
      }
    }

    const latestDocuments = this.deduplicator.deduplicate(documents);

    for (const document of latestDocuments) {
      const ownerIdentityId = this.ownerIdentityIdFrom(document);

      if (ownerIdentityId) {
        await this.registry.putHead(`keychain:${ownerIdentityId}`, document);
      }
    }

    return documents.length;
  }
}
