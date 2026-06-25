import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityMapper from './mappers/OrbitDBCommunityMapper';

export default class OrbitDBCommunityRepository extends CommunityRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMapper,
  ) {
    super();
  }

  private escapeRegex(value: string): string {
    return value.replace(
      OrbitDBCommunityRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityDocument {
    return this.isStoredDocument(value) && value.deleted !== true;
  }

  private isStoredDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityDocument {
    return (
      this.hasStringFields(value, [
        'description',
        'id',
        'name',
        'networkId',
        'ownerIdentityId',
        'visibility',
      ]) &&
      typeof value.createdAt === 'number' &&
      this.isStringArray(value.memberIds) &&
      Array.isArray(value.textChannels)
    );
  }

  private communityHeadKey(communityId: string): string {
    return `community:${communityId}`;
  }

  private memberIndexHeadKey(identityId: string): string {
    return `community-member-index:${identityId}`;
  }

  private communityDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityDocument[] | undefined {
    if (!record) {
      return undefined;
    }

    const communities = record.communities;

    if (!Array.isArray(communities)) {
      return [];
    }

    return communities
      .filter((community): community is Record<string, unknown> =>
        this.isRecord(community),
      )
      .filter((community): community is OrbitDBCommunityDocument =>
        this.isDocument(community),
      );
  }

  private deduplicateDocuments(
    documents: OrbitDBCommunityDocument[],
  ): OrbitDBCommunityDocument[] {
    const deduplicated = new Map<string, OrbitDBCommunityDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()].sort(
      (left, right) => this.freshness(right) - this.freshness(left),
    );
  }

  private freshness(document: OrbitDBCommunityDocument): number {
    return Math.max(
      document.deletedAt ?? 0,
      document.updatedAt ?? 0,
      document.createdAt,
    );
  }

  private async findHead(
    id: CommunityId,
  ): Promise<Record<string, unknown> | undefined> {
    return this.registry.findHead(this.communityHeadKey(id.valueOf()));
  }

  private cachedCommunityDocuments(): OrbitDBCommunityDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('community:')
      .filter((document): document is OrbitDBCommunityDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => this.freshness(right) - this.freshness(left));
  }

  private async putMemberIndex(
    identityId: string,
    community: OrbitDBCommunityDocument,
  ): Promise<void> {
    const key = this.memberIndexHeadKey(identityId);
    const indexedCommunities =
      this.communityDocumentsFromIndex(await this.registry.findHead(key)) || [];
    const communities = this.deduplicateDocuments([
      ...indexedCommunities,
      community,
    ]).filter(
      (document) =>
        document.deleted !== true && document.memberIds.includes(identityId),
    );

    await this.registry.putHead(
      key,
      {
        communities: communities.map((document) => ({ ...document })),
        id: key,
        identityId,
        memberId: identityId,
        networkId: community.networkId,
        updatedAt: Date.now(),
      },
      [community.networkId],
    );
  }

  private async putCommunityHead(
    document: OrbitDBCommunityDocument,
  ): Promise<void> {
    await this.registry.putHead(
      this.communityHeadKey(document.id),
      {
        ...document,
      },
      [document.networkId],
    );
  }

  private async putMemberIndexes(
    document: OrbitDBCommunityDocument,
  ): Promise<void> {
    await Promise.all(
      document.memberIds.map((memberId) =>
        this.putMemberIndex(memberId, document),
      ),
    );
  }

  private refreshMemberIndexesInBackground(
    document: OrbitDBCommunityDocument,
  ): void {
    void this.putMemberIndexes(document).catch((error) => {
      Kernel.logger.warn?.(
        `Community member indexes refresh failed: communityId=${document.id} error=${String(error)}`,
      );
    });
  }

  private toFreshDocument(community: Community): OrbitDBCommunityDocument {
    return {
      ...this.mapper.toDocument(community),
      updatedAt: Date.now(),
    };
  }

  public async delete(community: Community): Promise<void> {
    const document = this.toFreshDocument(community);

    const deletedDocument = {
      ...document,
      deleted: true,
      deletedAt: Date.now(),
    };

    await this.registry.putDocument('communities', deletedDocument);
    await this.putCommunityHead(deletedDocument);
    await this.putMemberIndexes(deletedDocument);
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const head = await this.findHead(id);

    if (head) {
      return this.isDocument(head) ? this.mapper.toDomain(head) : undefined;
    }

    return undefined;
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const query = options.query?.trim();
    const regex = query ? new RegExp(this.escapeRegex(query), 'i') : undefined;
    const documents = this.cachedCommunityDocuments().filter((document) => {
      const isDiscoverable = document.discoverable ?? true;
      const networkMatches = options.networkId
        ? document.networkId === options.networkId
        : true;
      const queryMatches = regex
        ? regex.test(document.name) || regex.test(document.description)
        : true;

      return isDiscoverable && networkMatches && queryMatches;
    });

    return Promise.resolve(
      documents.slice(0, 50).map((document) => this.mapper.toDomain(document)),
    );
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const indexedDocuments = this.communityDocumentsFromIndex(
      await this.registry.findHead(
        this.memberIndexHeadKey(identityId.valueOf()),
      ),
    );
    const cachedDocuments = this.registry
      .findCachedHeadsByPrefix('community:')
      .map((candidate) => (this.isDocument(candidate) ? candidate : undefined))
      .filter(
        (document): document is OrbitDBCommunityDocument =>
          document !== undefined &&
          document.memberIds.includes(identityId.valueOf()),
      );
    const documents = [...(indexedDocuments || []), ...cachedDocuments];

    return this.deduplicateDocuments(documents)
      .filter((document) => document.memberIds.includes(identityId.valueOf()))
      .map((document) => this.mapper.toDomain(document));
  }

  public async findSyncable(): Promise<Community[]> {
    return Promise.resolve(
      this.cachedCommunityDocuments().map((document) =>
        this.mapper.toDomain(document),
      ),
    );
  }

  public async save(community: Community): Promise<void> {
    const document = this.toFreshDocument(community);

    await this.registry.putDocument('communities', document);
    await this.putCommunityHead(document);
    this.refreshMemberIndexesInBackground(document);
  }
}
