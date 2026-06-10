import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Community } from '../../domain/Community';
import { CommunityRole } from '../../domain/entities/membership/CommunityRole';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../domain/value-objects/CommunityRoleId';
import { MongoCommunityDocument } from './documents/MongoCommunityDocument';
import { MongoCommunityRoleDocument } from './documents/MongoCommunityRoleDocument';
import { MongoCommunityTextChannelDocument } from './documents/MongoCommunityTextChannelDocument';
import { MongoCommunityVoiceChannelDocument } from './documents/MongoCommunityVoiceChannelDocument';

export default class MongoCommunityRepository extends CommunityRepository {
  private static readonly COLLECTION = 'communities';
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoCommunityDocument>(
      MongoCommunityRepository.COLLECTION,
    );
  }

  private toDocument(community: Community): MongoCommunityDocument {
    const primitives = community.toPrimitives();

    return {
      _id: primitives.id,
      autoJoinEnabled: primitives.autoJoinEnabled,
      avatar: primitives.avatar,
      bannedMemberIds: primitives.bannedMemberIds,
      banner: primitives.banner,
      createdAt: primitives.createdAt,
      description: primitives.description,
      discoverable: primitives.discoverable,
      memberIds: primitives.memberIds,
      memberRoles: primitives.memberRoles,
      name: primitives.name,
      networkId: primitives.networkId,
      ownerIdentityId: primitives.ownerIdentityId,
      roles: primitives.roles,
      textChannels: primitives.textChannels,
      visibility: primitives.visibility,
      voiceChannels: primitives.voiceChannels,
    };
  }

  private toDomain(document: MongoCommunityDocument): Community {
    return Community.fromPrimitives({
      autoJoinEnabled: document.autoJoinEnabled ?? false,
      avatar: document.avatar,
      bannedMemberIds: document.bannedMemberIds || [],
      banner: document.banner,
      createdAt: document.createdAt,
      description: document.description,
      discoverable: document.discoverable ?? true,
      id: document._id,
      memberIds: document.memberIds,
      memberRoles: document.memberRoles || [],
      name: document.name,
      networkId: document.networkId,
      ownerIdentityId: document.ownerIdentityId,
      roles: this.rolesFromDocument(document.roles),
      textChannels: document.textChannels.map((channel) =>
        this.textChannelFromDocument(channel),
      ),
      visibility: document.visibility,
      voiceChannels: (document.voiceChannels || []).map((channel) =>
        this.voiceChannelFromDocument(channel),
      ),
    });
  }

  private rolesFromDocument(
    roles: MongoCommunityRoleDocument[] | undefined,
  ): ReturnType<CommunityRole['toPrimitives']>[] {
    return roles?.length ? roles : [CommunityRole.everyone().toPrimitives()];
  }

  private textChannelFromDocument(channel: MongoCommunityTextChannelDocument) {
    return {
      ...channel,
      permissions: channel.permissions || {
        visibleRoleIds: [CommunityRoleId.EVERYONE_VALUE],
      },
    };
  }

  private voiceChannelFromDocument(
    channel: MongoCommunityVoiceChannelDocument,
  ) {
    return {
      ...channel,
      permissions: channel.permissions || {
        visibleRoleIds: [CommunityRoleId.EVERYONE_VALUE],
      },
    };
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

  public async delete(community: Community): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({ _id: community.getId().valueOf() });
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const filter: Record<string, unknown> = {
      $or: [{ discoverable: true }, { discoverable: { $exists: false } }],
    };
    const query = options.query?.trim();

    if (options.networkId) {
      filter.networkId = options.networkId;
    }

    if (query) {
      const escapedQuery = this.escapeRegex(query);

      filter.$and = [
        { $or: filter.$or },
        {
          $or: [
            { name: { $options: 'i', $regex: escapedQuery } },
            { description: { $options: 'i', $regex: escapedQuery } },
          ],
        },
      ];
      delete filter.$or;
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

  public async findSyncable(): Promise<Community[]> {
    return this.findAll();
  }

  public async save(community: Community): Promise<void> {
    const document = this.toDocument(community);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
