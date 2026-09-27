import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '../../domain/value-objects/CommunityModerationLogId';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityModerationLogDocument } from './documents/OrbitDBCommunityModerationLogDocument';

export default class OrbitDBCommunityModerationLogRepository extends CommunityModerationLogRepository {
  private readonly logIndex: OrbitDBHeadIndex<OrbitDBCommunityModerationLogDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.logIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'logs',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.isNewerOrEqualDocument(current, candidate),
    });
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

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityModerationLogDocument {
    if (!this.isStoredDocument(document) || document.deleted === true) {
      return false;
    }

    try {
      this.toDomain(document);

      return true;
    } catch {
      return false;
    }
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
    const logs = this.logIndex
      .deduplicate([...((await this.logIndex.find(key)) ?? []), document])
      .filter(
        (candidate) =>
          this.isStoredDocument(candidate) &&
          candidate.communityId === document.communityId,
      );

    await this.logIndex.putDocuments(
      key,
      {
        communityId: document.communityId,
        id: key,
      },
      logs,
      { replace: true },
    );
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    await this.publicStorageGuard.assertPublic(communityId);
    const indexedDocuments =
      (await this.logIndex.find(this.communityIndexHeadKey(communityId))) ?? [];
    const typedDocuments = this.logIndex
      .deduplicate([
        ...indexedDocuments,
        ...this.cachedStoredLogDocuments(communityId),
      ])
      .filter(
        (document): document is OrbitDBCommunityModerationLogDocument =>
          this.isDocument(document) &&
          document.communityId === communityId.valueOf(),
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
    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = this.logIndex.deduplicate([
        ...((await this.logIndex.find(
          this.communityIndexHeadKey(communityId),
        )) ?? []),
        ...this.cachedLogDocuments(communityId),
      ]);

      await Promise.all(
        documents
          .filter(
            (document): document is OrbitDBCommunityModerationLogDocument =>
              this.isDocument(document) &&
              document.communityId === communityId.valueOf(),
          )
          .map(async (document) => {
            const tombstone = {
              ...document,
              deleted: true,
              deletedAt: Date.now(),
            };

            await this.registry.putDocument('moderationLogs', tombstone);
            await this.registry.putHeadExactly(this.logHeadKey(document.id), {
              ...tombstone,
            });
            await this.putIndex(tombstone);
          }),
      );
    });
  }

  public async save(entry: CommunityModerationLogEntry): Promise<void> {
    const document = this.toDocument(entry);
    await this.publicStorageGuard.runWhilePublic(
      new CommunityId(document.communityId),
      async () => {
        await this.registry.putDocument('moderationLogs', document);
        await this.registry.putHeadExactly(this.logHeadKey(document.id), {
          ...document,
        });
        this.publicStorageGuard.runInBackgroundWhilePublic(
          new CommunityId(document.communityId),
          () => this.putIndex(document),
        );
      },
    );
  }
}
