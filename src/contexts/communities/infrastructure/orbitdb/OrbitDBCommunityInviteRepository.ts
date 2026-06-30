import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityInviteDocument } from './documents/OrbitDBCommunityInviteDocument';
import OrbitDBCommunityInviteMapper from './mappers/OrbitDBCommunityInviteMapper';

export default class OrbitDBCommunityInviteRepository extends CommunityInviteRepository {
  private readonly inviteIndex: OrbitDBHeadIndex<OrbitDBCommunityInviteDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityInviteMapper,
  ) {
    super();
    this.inviteIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'invites',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
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

  private freshness(document: OrbitDBCommunityInviteDocument): number {
    return document.deletedAt ?? document.createdAt;
  }

  private async putHeads(
    document: OrbitDBCommunityInviteDocument,
  ): Promise<void> {
    await this.registry.putHead(this.tokenHeadKey(document.token), {
      ...document,
    });

    const key = this.communityIndexHeadKey(document.communityId);
    const invites = this.inviteIndex
      .deduplicate([...((await this.inviteIndex.find(key)) ?? []), document])
      .filter((candidate) => this.isDocument(candidate));

    await this.inviteIndex.putDocuments(
      key,
      {
        communityId: document.communityId,
        id: key,
      },
      invites,
    );
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
    const documents =
      (await this.inviteIndex.find(this.communityIndexHeadKey(communityId))) ??
      [];

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
