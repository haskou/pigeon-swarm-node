import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '../../domain/value-objects/CommunityModerationLogId';
import { OrbitDBCommunityModerationLogDocument } from './documents/OrbitDBCommunityModerationLogDocument';

// eslint-disable-next-line max-len
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

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    const communityIdValue = communityId.valueOf();
    const documents = await this.registry.queryDocuments(
      'moderationLogs',
      (document) => document.communityId === communityIdValue,
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
    const documents = await this.registry.queryDocuments(
      'moderationLogs',
      (document) => document.communityId === communityId.valueOf(),
    );

    await Promise.all(
      documents
        .filter((document): document is OrbitDBCommunityModerationLogDocument =>
          this.isDocument(document),
        )
        .map((document) =>
          this.registry.putDocument('moderationLogs', {
            ...document,
            deleted: true,
            deletedAt: Date.now(),
          }),
        ),
    );
  }

  public async save(entry: CommunityModerationLogEntry): Promise<void> {
    await this.registry.putDocument('moderationLogs', this.toDocument(entry));
  }
}
