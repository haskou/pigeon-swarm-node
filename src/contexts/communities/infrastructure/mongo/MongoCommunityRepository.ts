import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Community } from '../../domain/Community';
import { CommunityRepository } from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityDocument } from './documents/MongoCommunityDocument';

export class MongoCommunityRepository implements CommunityRepository {
  private static readonly COLLECTION = 'communities';
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityDocument>(
      MongoCommunityRepository.COLLECTION,
    );
  }

  private toDocument(community: Community): MongoCommunityDocument {
    const primitives = community.toPrimitives();

    return {
      _id: primitives.id,
      avatar: primitives.avatar,
      banner: primitives.banner,
      createdAt: primitives.createdAt,
      description: primitives.description,
      memberIds: primitives.memberIds,
      name: primitives.name,
      networkId: primitives.networkId,
      ownerIdentityId: primitives.ownerIdentityId,
      textChannels: primitives.textChannels,
      visibility: primitives.visibility,
      voiceChannels: primitives.voiceChannels,
    };
  }

  private toDomain(document: MongoCommunityDocument): Community {
    return Community.fromPrimitives({
      avatar: document.avatar,
      banner: document.banner,
      createdAt: document.createdAt,
      description: document.description,
      id: document._id,
      memberIds: document.memberIds,
      name: document.name,
      networkId: document.networkId,
      ownerIdentityId: document.ownerIdentityId,
      textChannels: document.textChannels,
      visibility: document.visibility,
      voiceChannels: document.voiceChannels || [],
    });
  }

  private escapeRegex(value: string): string {
    return value.replace(
      MongoCommunityRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const filter: Record<string, unknown> = {};
    const query = options.query?.trim();

    if (options.networkId) {
      filter.networkId = options.networkId;
    }

    if (query) {
      const escapedQuery = this.escapeRegex(query);

      filter.$or = [
        { name: { $options: 'i', $regex: escapedQuery } },
        { description: { $options: 'i', $regex: escapedQuery } },
      ];
    }

    const documents = await (await this.collection())
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const documents = await (await this.collection())
      .find({ memberIds: identityId.valueOf() })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findAll(): Promise<Community[]> {
    const documents = await (await this.collection()).find({}).toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(community: Community): Promise<void> {
    const document = this.toDocument(community);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
