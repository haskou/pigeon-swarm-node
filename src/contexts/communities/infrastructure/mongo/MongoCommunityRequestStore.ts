import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CommunityMembershipRequest } from '../../domain/CommunityMembershipRequest';
import { CommunityRequestStore } from '../../domain/repositories/CommunityRequestStore';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityRequestId } from '../../domain/value-objects/CommunityRequestId';
import { MongoCommunityDocument } from './documents/MongoCommunityDocument';
import { MongoCommunityRequestDocument } from './documents/MongoCommunityRequestDocument';

export class MongoCommunityRequestStore implements CommunityRequestStore {
  private static readonly COLLECTION = 'community_membership_requests';
  private static readonly COMMUNITIES_COLLECTION = 'communities';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityRequestDocument>(
      MongoCommunityRequestStore.COLLECTION,
    );
  }

  private async communitiesCollection() {
    return this.mongo.getCollection<MongoCommunityDocument>(
      MongoCommunityRequestStore.COMMUNITIES_COLLECTION,
    );
  }

  private toDocument(
    request: CommunityMembershipRequest,
  ): MongoCommunityRequestDocument {
    const primitives = request.toPrimitives();

    return {
      _id: primitives.id,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      identityId: primitives.identityId,
      status: primitives.status,
      type: primitives.type,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(
    document: MongoCommunityRequestDocument,
  ): CommunityMembershipRequest {
    return CommunityMembershipRequest.fromPrimitives({
      communityId: document.communityId,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      id: document._id,
      identityId: document.identityId,
      status: document.status,
      type: document.type,
      updatedAt: document.updatedAt,
    });
  }

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        communityId: communityId.valueOf(),
        identityId: identityId.valueOf(),
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined> {
    const document = await (
      await this.collection()
    ).findOne({ _id: id.valueOf() });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        $or: [
          { creatorIdentityId: identityId.valueOf() },
          { identityId: identityId.valueOf() },
        ],
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const communityIds = await (await this.communitiesCollection())
      .find({ ownerIdentityId: ownerIdentityId.valueOf() })
      .project<{ _id: string }>({ _id: 1 })
      .toArray();

    if (communityIds.length === 0) {
      return [];
    }

    const documents = await (
      await this.collection()
    )
      .find({
        communityId: { $in: communityIds.map((community) => community._id) },
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(request: CommunityMembershipRequest): Promise<void> {
    const document = this.toDocument(request);

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
