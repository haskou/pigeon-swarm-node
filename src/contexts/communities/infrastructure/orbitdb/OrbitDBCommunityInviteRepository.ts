import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityInviteUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteUses';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityInviteDocument } from './documents/OrbitDBCommunityInviteDocument';
import { OrbitDBCommunityInviteUseDocument } from './documents/OrbitDBCommunityInviteUseDocument';
import OrbitDBCommunityInviteMapper from './mappers/OrbitDBCommunityInviteMapper';

export default class OrbitDBCommunityInviteRepository extends CommunityInviteRepository {
  private readonly inviteIndex: OrbitDBHeadIndex<OrbitDBCommunityInviteDocument>;

  private readonly useIndex: OrbitDBHeadIndex<OrbitDBCommunityInviteUseDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityInviteMapper,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.inviteIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'requests',
      documentFromRecord: (record) =>
        this.isInvite(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
    this.useIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'requests',
      documentFromRecord: (record) => (this.isUse(record) ? record : undefined),
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private isInvite(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityInviteDocument {
    if (
      value.scopeType !== 'community_invite' ||
      ['communityId', 'creatorIdentityId', 'id', 'nonce', 'token'].some(
        (field) => typeof value[field] !== 'string',
      ) ||
      typeof value.createdAt !== 'number' ||
      typeof value.maxUses !== 'number'
    ) {
      return false;
    }

    try {
      const invite = this.mapper.toDomain(
        value as OrbitDBCommunityInviteDocument,
      );

      return invite.getToken().valueOf() === value.id;
    } catch {
      return false;
    }
  }

  private isUse(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityInviteUseDocument {
    return (
      value.scopeType === 'community_invite_use' &&
      ['communityId', 'id', 'identityId', 'token'].every(
        (field) => typeof value[field] === 'string',
      ) &&
      typeof value.usedAt === 'number'
    );
  }

  private tokenHeadKey(token: string): string {
    return `community-invite-token:${token}`;
  }

  private useHeadKey(token: string): string {
    return `community-invite-uses:${token}`;
  }

  private async put<T extends object>(
    index: OrbitDBHeadIndex<T>,
    communityId: CommunityId,
    key: string,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      PublicMutationRecord.assertNotStale(
        (await index.findRecords(key)).filter(
          (stored) => stored.id === payload.id,
        ),
        document,
      );
      await this.registry.putDocument('requests', document);
      await index.putRecord(key, { id: key }, document, [], {
        recordFilter: (record) => record.communityId === payload.communityId,
        replace: true,
      });
    });
  }

  public async countUses(
    invite: CommunityInvite,
  ): Promise<CommunityInviteUses> {
    const token = invite.getToken().valueOf();
    const uses = (await this.useIndex.find(this.useHeadKey(token))) ?? [];

    return new CommunityInviteUses(
      new Set(uses.filter((use) => use.token === token).map((use) => use.id))
        .size,
    );
  }

  public async findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined> {
    const [document] = (
      (await this.inviteIndex.find(this.tokenHeadKey(token.valueOf()))) ?? []
    ).filter((candidate) => candidate.token === token.valueOf());

    if (!document) return undefined;

    return this.publicStorageGuard.runWhilePublic(
      new CommunityId(document.communityId),
      () => Promise.resolve(this.mapper.toDomain(document)),
    );
  }

  public async recordUse(
    invite: CommunityInvite,
    identityId: IdentityId,
    usedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    const token = invite.getToken().valueOf();

    await this.put(
      this.useIndex,
      invite.getCommunityId(),
      this.useHeadKey(token),
      {
        communityId: invite.getCommunityId().valueOf(),
        id: `invite-use:${token}:${identityId.valueOf()}`,
        identityId: identityId.valueOf(),
        scopeType: 'community_invite_use',
        token,
        usedAt: usedAt.valueOf(),
      },
      proof,
    );
  }

  public async save(
    invite: CommunityInvite,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.put(
      this.inviteIndex,
      invite.getCommunityId(),
      this.tokenHeadKey(invite.getToken().valueOf()),
      this.mapper.toPayload(invite),
      proof,
    );
  }
}
