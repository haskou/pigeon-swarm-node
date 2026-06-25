import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '../../domain/value-objects/CommunityModerationLogId';
import { OrbitDBCommunityModerationLogDocument } from './documents/OrbitDBCommunityModerationLogDocument';

export default class OrbitDBCommunityModerationLogRepository extends CommunityModerationLogRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private hasModerationIdentityFields(
    document: Record<string, unknown>,
  ): boolean {
    return (
      typeof document.id === 'string' &&
      typeof document.action === 'string' &&
      typeof document.actorIdentityId === 'string' &&
      typeof document.communityId === 'string' &&
      typeof document.createdAt === 'number'
    );
  }

  private hasModerationPayloadFields(
    document: Record<string, unknown>,
  ): boolean {
    return (
      typeof document.details === 'object' &&
      document.details !== null &&
      typeof document.target === 'object' &&
      document.target !== null
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityModerationLogDocument {
    return this.isStoredDocument(document) && document.deleted !== true;
  }

  private isStoredDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityModerationLogDocument {
    return (
      this.hasModerationIdentityFields(document) &&
      this.hasModerationPayloadFields(document)
    );
  }

  private toDocument(
    entry: CommunityModerationLogEntry,
  ): OrbitDBCommunityModerationLogDocument {
    return entry.toPrimitives();
  }

  private toDomain(
    document: OrbitDBCommunityModerationLogDocument,
  ): CommunityModerationLogEntry {
    return CommunityModerationLogEntry.fromPrimitives(document);
  }

  private communityIndexHeadKey(communityId: CommunityId | string): string {
    const value =
      communityId instanceof CommunityId ? communityId.valueOf() : communityId;

    return `community-moderation-log-index:${value}`;
  }

  private logHeadKey(logId: string): string {
    return `community-moderation-log:${logId}`;
  }

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityModerationLogDocument[] {
    const logs: unknown = record?.logs;

    if (!Array.isArray(logs)) {
      return [];
    }

    return (logs as unknown[]).filter(
      (document): document is OrbitDBCommunityModerationLogDocument =>
        this.isRecord(document) && this.isDocument(document),
    );
  }

  private deduplicateDocuments(
    documents: OrbitDBCommunityModerationLogDocument[],
  ): OrbitDBCommunityModerationLogDocument[] {
    const deduplicated = new Map<
      string,
      OrbitDBCommunityModerationLogDocument
    >();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || this.isNewerOrEqualDocument(current, document)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private freshness(document: OrbitDBCommunityModerationLogDocument): number {
    return document.deletedAt ?? document.createdAt;
  }

  private isNewerOrEqualDocument(
    current: OrbitDBCommunityModerationLogDocument,
    candidate: OrbitDBCommunityModerationLogDocument,
  ): boolean {
    const currentFreshness = this.freshness(current);
    const candidateFreshness = this.freshness(candidate);

    if (currentFreshness !== candidateFreshness) {
      return currentFreshness <= candidateFreshness;
    }

    return current.deleted !== true && candidate.deleted === true;
  }

  private cachedLogDocuments(
    communityId: CommunityId,
  ): OrbitDBCommunityModerationLogDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('community-moderation-log:')
      .filter(
        (document): document is OrbitDBCommunityModerationLogDocument =>
          this.isDocument(document) &&
          document.communityId === communityId.valueOf(),
      );
  }

  private cachedStoredLogDocuments(
    communityId: CommunityId,
  ): OrbitDBCommunityModerationLogDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('community-moderation-log:')
      .filter(
        (document): document is OrbitDBCommunityModerationLogDocument =>
          this.isStoredDocument(document) &&
          document.communityId === communityId.valueOf(),
      );
  }

  private async putIndex(
    document: OrbitDBCommunityModerationLogDocument,
  ): Promise<void> {
    const key = this.communityIndexHeadKey(document.communityId);
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const logs = this.deduplicateDocuments([
      ...indexedDocuments,
      document,
    ]).filter((candidate) => this.isDocument(candidate));

    await this.registry.putHead(key, {
      communityId: document.communityId,
      id: key,
      logs: logs.map((log) => ({ ...log })),
      updatedAt: Date.now(),
    });
  }

  private refreshIndexInBackground(
    document: OrbitDBCommunityModerationLogDocument,
  ): void {
    void this.putIndex(document).catch((error) => {
      Kernel.logger.warn?.(
        `Community moderation log index refresh failed: logId=${document.id} error=${String(error)}`,
      );
    });
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    );
    const typedDocuments = this.deduplicateDocuments([
      ...indexedDocuments,
      ...this.cachedStoredLogDocuments(communityId),
    ])
      .filter((document): document is OrbitDBCommunityModerationLogDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => {
        if (left.createdAt === right.createdAt) {
          return right.id.localeCompare(left.id);
        }

        return right.createdAt - left.createdAt;
      });
    const beforeLog = beforeLogId
      ? typedDocuments.find((document) => document.id === beforeLogId.valueOf())
      : undefined;
    const paginatedDocuments = beforeLog
      ? typedDocuments.filter(
          (document) =>
            document.createdAt < beforeLog.createdAt ||
            (document.createdAt === beforeLog.createdAt &&
              document.id < beforeLog.id),
        )
      : typedDocuments;

    return paginatedDocuments
      .slice(0, limit)
      .map((document) => this.toDomain(document));
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents = this.deduplicateDocuments([
      ...this.documentsFromIndex(
        await this.registry.findHead(this.communityIndexHeadKey(communityId)),
      ),
      ...this.cachedLogDocuments(communityId),
    ]);

    await Promise.all(
      documents
        .filter((document): document is OrbitDBCommunityModerationLogDocument =>
          this.isDocument(document),
        )
        .map(async (document) => {
          const tombstone = {
            ...document,
            deleted: true,
            deletedAt: Date.now(),
          };

          await this.registry.putDocument('moderationLogs', tombstone);
          await this.registry.putHead(this.logHeadKey(document.id), {
            ...tombstone,
          });
          await this.putIndex(tombstone);
        }),
    );
  }

  public async save(entry: CommunityModerationLogEntry): Promise<void> {
    const document = this.toDocument(entry);

    await this.registry.putDocument('moderationLogs', document);
    await this.registry.putHead(this.logHeadKey(document.id), {
      ...document,
    });
    this.refreshIndexInBackground(document);
  }
}
