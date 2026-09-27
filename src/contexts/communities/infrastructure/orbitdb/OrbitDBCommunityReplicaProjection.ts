import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CommunityId } from '../../domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityReplicaMerger from './OrbitDBCommunityReplicaMerger';

type OrbitDBCommunityTombstone = Record<string, unknown> & {
  id: string;
  networkId: string;
  removed: true;
};

export default class OrbitDBCommunityReplicaProjection {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly merger: OrbitDBCommunityReplicaMerger,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {}

  private publishCommunityRepair(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): void {
    const communityId = key.startsWith('community:')
      ? key.slice('community:'.length)
      : '';

    if (!communityId || value.id !== communityId) return;
    this.publicStorageGuard.runInBackgroundWhilePublic(
      new CommunityId(communityId),
      () => this.registry.putHeadExactly(key, value, [networkId]),
    );
  }

  private publishMemberIndexRepair(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): void {
    const communityIds = this.indexRecords(value).map(
      (record) => new CommunityId(record.id),
    );

    if (communityIds.length === 0) return;
    this.publicStorageGuard.runInBackgroundWhilePublicScopes(communityIds, () =>
      this.registry.putHeadExactly(key, value, [networkId]),
    );
  }

  private isDocument(value: unknown): value is OrbitDBCommunityDocument {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;

    return (
      record.removed !== true &&
      [
        'id',
        'networkId',
        'ownerIdentityId',
        'name',
        'description',
        'visibility',
      ].every((key) => typeof record[key] === 'string') &&
      typeof record.createdAt === 'number' &&
      Array.isArray(record.memberIds) &&
      Array.isArray(record.textChannels)
    );
  }

  private isTombstone(value: unknown): value is OrbitDBCommunityTombstone {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;

    return (
      typeof record.id === 'string' &&
      typeof record.networkId === 'string' &&
      record.removed === true &&
      typeof record.updatedAt === 'number' &&
      Number.isFinite(record.updatedAt)
    );
  }

  private indexRecords(
    record: Record<string, unknown> | undefined,
  ): Array<OrbitDBCommunityDocument | OrbitDBCommunityTombstone> {
    const values: unknown = record?.communities;

    return Array.isArray(values)
      ? values.filter(
          (
            value,
          ): value is OrbitDBCommunityDocument | OrbitDBCommunityTombstone =>
            this.isDocument(value) || this.isTombstone(value),
        )
      : [];
  }

  private documents(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityDocument[] {
    return this.indexRecords(record).filter(
      (value): value is OrbitDBCommunityDocument => this.isDocument(value),
    );
  }

  private freshness(record: Record<string, unknown>): number {
    return Math.max(
      typeof record.updatedAt === 'number' ? record.updatedAt : 0,
      typeof record.deletedAt === 'number' ? record.deletedAt : 0,
      typeof record.createdAt === 'number' ? record.createdAt : 0,
    );
  }

  private mergeIndexRecord(
    current: OrbitDBCommunityDocument | OrbitDBCommunityTombstone,
    candidate: OrbitDBCommunityDocument | OrbitDBCommunityTombstone,
  ): OrbitDBCommunityDocument | OrbitDBCommunityTombstone {
    if (this.isTombstone(current) || this.isTombstone(candidate)) {
      return this.freshness(current) <= this.freshness(candidate)
        ? candidate
        : current;
    }

    return this.merger.merge(current, candidate);
  }

  private mergeIndex(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    const documents = new Map<
      string,
      OrbitDBCommunityDocument | OrbitDBCommunityTombstone
    >();
    for (const document of [
      ...this.indexRecords(current),
      ...this.indexRecords(candidate),
    ]) {
      const previous = documents.get(document.id);
      documents.set(
        document.id,
        previous ? this.mergeIndexRecord(previous, document) : document,
      );
    }

    return {
      ...candidate,
      communities: [...documents.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      updatedAt: Math.max(
        Number(current?.updatedAt) || 0,
        Number(candidate.updatedAt) || 0,
      ),
    };
  }

  private scopedIndex(
    networkId: string,
    record: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const communities = this.indexRecords(record).filter(
      (document) => document.networkId === networkId,
    );

    if (communities.length === 0) return undefined;

    return {
      communities,
      id: record.id,
      identityId: record.identityId,
      memberId: record.memberId,
      networkId,
      updatedAt: record.updatedAt,
    };
  }

  public register(): void {
    this.registry.registerHeadRecordMerger(
      'community:',
      (current, candidate) => {
        if (!this.isDocument(candidate)) return current;
        const previous = this.isDocument(current) ? current : candidate;

        return this.merger.merge(previous, candidate);
      },
      (networkId, value) => (value.networkId === networkId ? value : undefined),
      (networkId, key, value) =>
        this.publishCommunityRepair(networkId, key, value),
    );
    this.registry.registerHeadRecordMerger(
      'community-member-index:',
      (current, candidate) => this.mergeIndex(current, candidate),
      (networkId, value) => this.scopedIndex(networkId, value),
      (networkId, key, value) =>
        this.publishMemberIndexRepair(networkId, key, value),
    );
  }
}
