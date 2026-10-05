import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
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
      collectionName: 'moderationLogs',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityModerationLogDocument {
    if (
      document.scopeType !== 'community_moderation_log' ||
      document.removed === true ||
      ['action', 'actorIdentityId', 'communityId', 'id'].some(
        (field) => typeof document[field] !== 'string',
      ) ||
      typeof document.createdAt !== 'number' ||
      typeof document.details !== 'object' ||
      document.details === null ||
      typeof document.target !== 'object' ||
      document.target === null
    ) {
      return false;
    }

    try {
      this.toDomain(document as OrbitDBCommunityModerationLogDocument);

      return true;
    } catch {
      return false;
    }
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

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const typedDocuments = (
        (await this.logIndex.find(this.communityIndexHeadKey(communityId))) ??
        []
      )
        .filter((document) => document.communityId === communityId.valueOf())
        .sort((left, right) => {
          if (left.createdAt === right.createdAt) {
            return right.id.localeCompare(left.id);
          }

          return right.createdAt - left.createdAt;
        });
      const beforeLog = beforeLogId
        ? typedDocuments.find(
            (document) => document.id === beforeLogId.valueOf(),
          )
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
    });
  }

  public async save(
    entry: CommunityModerationLogEntry,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = {
      ...entry.toPrimitives(),
      scopeType: 'community_moderation_log',
    };
    const document = PublicMutationRecord.withProof(payload, proof);
    const key = this.communityIndexHeadKey(payload.communityId);

    await this.publicStorageGuard.runWhilePublic(
      new CommunityId(payload.communityId),
      async () => {
        PublicMutationRecord.assertNotStale(
          (await this.logIndex.findRecords(key)).filter(
            (stored) => stored.id === payload.id,
          ),
          document,
        );
        await this.registry.putDocument('moderationLogs', document);
        await this.logIndex.putRecord(
          key,
          { communityId: payload.communityId, id: key },
          document,
          [],
          {
            recordFilter: (record) => record.communityId === payload.communityId,
            replace: true,
          },
        );
      },
    );
  }
}
