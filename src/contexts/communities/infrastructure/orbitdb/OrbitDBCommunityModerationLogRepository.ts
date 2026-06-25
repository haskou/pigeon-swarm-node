import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

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
      document.deleted !== true &&
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
      deduplicated.set(document.id, document);
    }

    return [...deduplicated.values()];
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

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    );
    const typedDocuments = documents
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
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    );

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
          await this.putIndex(tombstone);
        }),
    );
  }

  public async save(entry: CommunityModerationLogEntry): Promise<void> {
    const document = this.toDocument(entry);

    await this.registry.putDocument('moderationLogs', document);
    await this.putIndex(document);
  }
}
