import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityInviteDocument } from './documents/OrbitDBCommunityInviteDocument';
import OrbitDBCommunityInviteMapper from './mappers/OrbitDBCommunityInviteMapper';

// eslint-disable-next-line max-len
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

  private async findDocuments(
    matcher: (document: OrbitDBCommunityInviteDocument) => boolean,
  ): Promise<OrbitDBCommunityInviteDocument[]> {
    const documents = await this.registry.queryDocuments(
      'requests',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents.filter(
      (document): document is OrbitDBCommunityInviteDocument =>
        this.isDocument(document),
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
    const documents = await this.findDocuments((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('requests', {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        }),
      ),
    );
  }

  public async findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new CommunityInviteToken(candidate.token).isEqual(token),
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async save(invite: CommunityInvite): Promise<void> {
    await this.registry.putDocument('requests', this.mapper.toDocument(invite));
  }
}
