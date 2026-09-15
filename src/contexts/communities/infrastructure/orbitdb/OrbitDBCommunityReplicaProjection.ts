import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityReplicaMerger from './OrbitDBCommunityReplicaMerger';

export default class OrbitDBCommunityReplicaProjection {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly merger: OrbitDBCommunityReplicaMerger,
  ) {}

  private isDocument(value: unknown): value is OrbitDBCommunityDocument {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;

    return (
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

  private documents(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityDocument[] {
    const values: unknown = record?.communities;

    return Array.isArray(values)
      ? values.filter((value): value is OrbitDBCommunityDocument =>
          this.isDocument(value),
        )
      : [];
  }

  private mergeIndex(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    const documents = new Map<string, OrbitDBCommunityDocument>();
    for (const document of [
      ...this.documents(current),
      ...this.documents(candidate),
    ]) {
      const previous = documents.get(document.id) ?? document;
      documents.set(document.id, this.merger.merge(previous, document));
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

  public register(): void {
    this.registry.registerHeadRecordMerger(
      'community:',
      (current, candidate) => {
        if (!this.isDocument(candidate)) return current;
        const previous = this.isDocument(current) ? current : candidate;

        return this.merger.merge(previous, candidate);
      },
    );
    this.registry.registerHeadRecordMerger(
      'community-member-index:',
      (current, candidate) => this.mergeIndex(current, candidate),
    );
  }
}
