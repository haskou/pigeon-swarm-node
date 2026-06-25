import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityInviteDocument } from './documents/OrbitDBCommunityInviteDocument';
import OrbitDBCommunityInviteMapper from './mappers/OrbitDBCommunityInviteMapper';

export default class OrbitDBCommunityInviteRepository extends CommunityInviteRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityInviteMapper,
  ) {
    super();
  }

  private hasNumberFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'number');
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityInviteDocument {
    return (
      value.kind === 'community_invite' &&
      value.deleted !== true &&
      this.hasStringFields(value, [
        'communityId',
        'creatorIdentityId',
        'id',
        'token',
      ]) &&
      this.hasNumberFields(value, ['createdAt', 'maxUses', 'uses'])
    );
  }

  private tokenHeadKey(token: string): string {
    return `community-invite-token:${token}`;
  }

  private communityIndexHeadKey(communityId: CommunityId | string): string {
    const value =
      communityId instanceof CommunityId ? communityId.valueOf() : communityId;

    return `community-invite-community-index:${value}`;
  }

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityInviteDocument[] {
    const invites: unknown = record?.invites;

    if (!Array.isArray(invites)) {
      return [];
    }

    return (invites as unknown[]).filter(
      (document): document is OrbitDBCommunityInviteDocument =>
        this.isRecord(document) && this.isDocument(document),
    );
  }

  private freshness(document: OrbitDBCommunityInviteDocument): number {
    return document.deletedAt ?? document.createdAt;
  }

  private deduplicateDocuments(
    documents: OrbitDBCommunityInviteDocument[],
  ): OrbitDBCommunityInviteDocument[] {
    const deduplicated = new Map<string, OrbitDBCommunityInviteDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private async putHeads(
    document: OrbitDBCommunityInviteDocument,
  ): Promise<void> {
    await this.registry.putHead(this.tokenHeadKey(document.token), {
      ...document,
    });

    const key = this.communityIndexHeadKey(document.communityId);
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const invites = this.deduplicateDocuments([
      ...indexedDocuments,
      document,
    ]).filter((candidate) => this.isDocument(candidate));

    await this.registry.putHead(key, {
      communityId: document.communityId,
      id: key,
      invites: invites.map((invite) => ({ ...invite })),
      updatedAt: Date.now(),
    });
  }

  public async consume(invite: CommunityInvite): Promise<CommunityInvite> {
    const currentInvite = await this.findByToken(invite.getToken());

    if (!currentInvite) {
      throw new CommunityInviteNotFoundError();
    }

    currentInvite.accept();
    await this.save(currentInvite);

    return currentInvite;
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    );

    await Promise.all(
      documents.map(async (document) => {
        const tombstone = {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        };

        await this.registry.putDocument('requests', tombstone);
        await this.putHeads(tombstone);
      }),
    );
  }

  public async findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined> {
    const head = await this.registry.findHead(
      this.tokenHeadKey(token.valueOf()),
    );
    const document = head && this.isDocument(head) ? head : undefined;

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async save(invite: CommunityInvite): Promise<void> {
    const document = this.mapper.toDocument(invite);

    await this.registry.putDocument('requests', document);
    await this.putHeads(document);
  }
}
