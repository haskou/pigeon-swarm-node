import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CommunityInvite } from '../../domain/entities/invites/CommunityInvite';
import { CommunityInviteNotFoundError } from '../../domain/errors/CommunityInviteNotFoundError';
import InviteRepository from '../../domain/repositories/CommunityInviteRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityInviteToken } from '../../domain/value-objects/CommunityInviteToken';
import { MongoCommunityInviteDocument } from './documents/MongoCommunityInviteDocument';

export default class MongoCommunityInviteRepository extends InviteRepository {
  private static readonly COLLECTION = 'community_invites';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoCommunityInviteDocument>(
      MongoCommunityInviteRepository.COLLECTION,
    );
  }

  private toDocument(invite: CommunityInvite): MongoCommunityInviteDocument {
    const primitives = invite.toPrimitives();

    return {
      _id: primitives.token,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      encryptedCommunityKey: primitives.encryptedCommunityKey,
      expiresAt: primitives.expiresAt,
      maxUses: primitives.maxUses,
      uses: primitives.uses,
    };
  }

  private toDomain(document: MongoCommunityInviteDocument): CommunityInvite {
    return CommunityInvite.fromPrimitives({
      communityId: document.communityId,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      encryptedCommunityKey: document.encryptedCommunityKey,
      expiresAt: document.expiresAt,
      maxUses: document.maxUses,
      token: document._id,
      uses: document.uses,
    });
  }

  public async findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined> {
    const document = await (
      await this.collection()
    ).findOne({ _id: token.valueOf() });

    return document ? this.toDomain(document) : undefined;
  }

  public async consume(invite: CommunityInvite): Promise<CommunityInvite> {
    const now = Date.now();
    const primitives = invite.toPrimitives();
    const result = await (
      await this.collection()
    ).updateOne(
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
        _id: primitives.token,
        uses: { $lt: primitives.maxUses },
      },
      { $inc: { uses: 1 } },
    );

    if (result.modifiedCount === 1) {
      return (await this.findByToken(invite.getToken())) as CommunityInvite;
    }

    const currentInvite = await this.findByToken(invite.getToken());

    if (!currentInvite) {
      throw new CommunityInviteNotFoundError();
    }

    currentInvite.accept();

    return currentInvite;
  }

  public async save(invite: CommunityInvite): Promise<void> {
    const document = this.toDocument(invite);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    await (
      await this.collection()
    ).deleteMany({
      communityId: communityId.valueOf(),
    });
  }
}
