import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { MLSRecord } from '../../domain/MLSRecord';
import MLSRecordRepository from '../../domain/repositories/MLSRecordRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MLSRecordId } from '../../domain/value-objects/MLSRecordId';
import { MLSRecordKind } from '../../domain/value-objects/MLSRecordKind';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBMLSRecordDocument } from './documents/OrbitDBMLSRecordDocument';
import { MLSRecordDocumentId } from './MLSRecordDocumentId';

export default class OrbitDBMLSRecordRepository extends MLSRecordRepository {
  private readonly index: OrbitDBHeadIndex<OrbitDBMLSRecordDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.index = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'mlsRecords',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: () => false,
    });
  }

  private indexKey(communityId: string): string {
    return `community-mls-index:${communityId}`;
  }

  private isDocument(
    record: Record<string, unknown>,
  ): record is OrbitDBMLSRecordDocument {
    try {
      const document = record as OrbitDBMLSRecordDocument;

      return (
        record.removed !== true &&
        record.scopeType === 'community_mls' &&
        typeof document.createdAt === 'number' &&
        document.id ===
          MLSRecordDocumentId.of(
            document.communityId,
            document.id.split(':mls:')[1],
          )
      );
    } catch {
      return false;
    }
  }

  private toRecord(document: OrbitDBMLSRecordDocument): MLSRecord {
    return new MLSRecord(
      new MLSRecordId(document.id.split(':mls:')[1]),
      new CommunityId(document.communityId),
      document.groupId,
      new MLSRecordKind(document.kind),
      document.payload,
      new IdentityId(document.authorIdentityId),
      new Timestamp(document.createdAt),
      document.epoch,
      document.recipientIdentityId
        ? new IdentityId(document.recipientIdentityId)
        : undefined,
    );
  }

  public async save(
    record: MLSRecord,
    proof: PublicMutationProof,
  ): Promise<void> {
    const communityId = record.communityId.valueOf();
    const document = PublicMutationRecord.withProof(
      {
        authorIdentityId: record.authorIdentityId.valueOf(),
        communityId,
        createdAt: record.createdAt.valueOf(),
        ...(record.epoch !== undefined && { epoch: record.epoch }),
        groupId: record.groupId,
        id: MLSRecordDocumentId.of(communityId, record.id.valueOf()),
        kind: record.kind.valueOf(),
        payload: record.payload,
        ...(record.recipientIdentityId && {
          recipientIdentityId: record.recipientIdentityId.valueOf(),
        }),
        scopeType: 'community_mls',
      },
      proof,
    );

    await this.publicStorageGuard.runWhilePublic(
      record.communityId,
      async () => {
        const stored = await this.index.findRecords(this.indexKey(communityId));

        if (stored.some((existing) => existing.id === document.id)) return;

        await this.registry.putDocument('mlsRecords', document);
        await this.index.putRecord(
          this.indexKey(communityId),
          { communityId, id: this.indexKey(communityId) },
          document,
          [],
          {
            recordFilter: (candidate) => candidate.communityId === communityId,
            replace: true,
          },
        );
      },
    );
  }

  public async findByCommunity(communityId: CommunityId): Promise<MLSRecord[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents =
        (await this.index.find(this.indexKey(communityId.valueOf()))) ?? [];

      return documents
        .filter((document) => this.isDocument(document))
        .map((document) => this.toRecord(document));
    });
  }
}
