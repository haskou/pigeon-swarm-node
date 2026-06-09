import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Community } from '../../domain/Community';
import { CommunityRole } from '../../domain/entities/membership/CommunityRole';
import { CommunityRepository } from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../domain/value-objects/CommunityRoleId';
import { MongoCommunityDocument } from './documents/MongoCommunityDocument';
import { MongoCommunityRoleDocument } from './documents/MongoCommunityRoleDocument';
import { MongoCommunityTextChannelDocument } from './documents/MongoCommunityTextChannelDocument';
import { MongoCommunityVoiceChannelDocument } from './documents/MongoCommunityVoiceChannelDocument';

export class MongoCommunityRepository implements CommunityRepository {
  private static readonly COLLECTION = 'communities';
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityDocument>(
      MongoCommunityRepository.COLLECTION,
    );
  }

  private arrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): unknown[] | undefined {
    const value = document[attribute];

    return Array.isArray(value) ? value : undefined;
  }

  private booleanValue(
    document: Record<string, unknown>,
    attribute: string,
  ): boolean | undefined {
    const value = document[attribute];

    return typeof value === 'boolean' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private replicatedCommunityRequiredValues(document: Record<string, unknown>):
    | {
        createdAt: number;
        description: string;
        id: string;
        memberIds: unknown[];
        name: string;
        networkId: string;
        ownerIdentityId: string;
        textChannels: unknown[];
        visibility: string;
      }
    | undefined {
    const values = {
      createdAt: this.numberValue(document, 'createdAt'),
      description: this.stringValue(document, 'description'),
      id: this.stringValue(document, 'id'),
      memberIds: this.arrayValue(document, 'memberIds'),
      name: this.stringValue(document, 'name'),
      networkId: this.stringValue(document, 'networkId'),
      ownerIdentityId: this.stringValue(document, 'ownerIdentityId'),
      textChannels: this.arrayValue(document, 'textChannels'),
      visibility: this.stringValue(document, 'visibility'),
    };

    if (Object.values(values).some((value) => value === undefined)) {
      return undefined;
    }

    return values as {
      createdAt: number;
      description: string;
      id: string;
      memberIds: unknown[];
      name: string;
      networkId: string;
      ownerIdentityId: string;
      textChannels: unknown[];
      visibility: string;
    };
  }

  private documentFromReplicatedDocument(
    document: Record<string, unknown>,
  ): MongoCommunityDocument | undefined {
    const values = this.replicatedCommunityRequiredValues(document);

    if (!values) {
      return undefined;
    }

    return {
      _id: values.id,
      autoJoinEnabled: this.booleanValue(document, 'autoJoinEnabled'),
      avatar: this.stringValue(document, 'avatar'),
      bannedMemberIds: this.arrayValue(document, 'bannedMemberIds') as
        | string[]
        | undefined,
      banner: this.stringValue(document, 'banner'),
      createdAt: values.createdAt,
      description: values.description,
      discoverable: this.booleanValue(document, 'discoverable'),
      memberIds: values.memberIds as string[],
      memberRoles: this.arrayValue(document, 'memberRoles') as
        | MongoCommunityDocument['memberRoles']
        | undefined,
      name: values.name,
      networkId: values.networkId,
      ownerIdentityId: values.ownerIdentityId,
      roles: this.arrayValue(document, 'roles') as
        | MongoCommunityDocument['roles']
        | undefined,
      textChannels:
        values.textChannels as MongoCommunityDocument['textChannels'],
      visibility: values.visibility as MongoCommunityDocument['visibility'],
      voiceChannels: this.arrayValue(document, 'voiceChannels') as
        | MongoCommunityDocument['voiceChannels']
        | undefined,
    };
  }

  private async findReplicatedDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<MongoCommunityDocument[]> {
    try {
      const documents =
        await OrbitDBReplicatedStateRegistry.shared().queryDocuments(
          'communities',
          matcher,
        );

      return documents
        .map((document) => this.documentFromReplicatedDocument(document))
        .filter(
          (document): document is MongoCommunityDocument =>
            document !== undefined,
        );
    } catch {
      return [];
    }
  }

  private deduplicateDocuments(
    documents: MongoCommunityDocument[],
  ): MongoCommunityDocument[] {
    const deduplicated = new Map<string, MongoCommunityDocument>();

    for (const document of documents) {
      deduplicated.set(document._id, document);
    }

    return [...deduplicated.values()];
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

  private matchesDiscoverableQuery(
    document: Record<string, unknown>,
    query?: string,
  ): boolean {
    if (!query) {
      return true;
    }

    const normalizedQuery = query.toLowerCase();
    const name = this.stringValue(document, 'name') || '';
    const description = this.stringValue(document, 'description') || '';

    return (
      name.toLowerCase().includes(normalizedQuery) ||
      description.toLowerCase().includes(normalizedQuery)
    );
  }

  private matchesNetwork(
    document: Record<string, unknown>,
    networkId?: string,
  ): boolean {
    return networkId
      ? this.stringValue(document, 'networkId') === networkId
      : true;
  }

  private matchesReplicatedDiscoverableCommunity(
    document: Record<string, unknown>,
    options: {
      networkId?: string;
      query?: string;
    },
  ): boolean {
    const discoverable = this.booleanValue(document, 'discoverable') ?? true;

    return (
      discoverable &&
      this.matchesNetwork(document, options.networkId) &&
      this.matchesDiscoverableQuery(document, options.query?.trim())
    );
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    if (document) {
      return this.toDomain(document);
    }

    const [replicatedDocument] = await this.findReplicatedDocuments(
      (candidate) => this.stringValue(candidate, 'id') === id.valueOf(),
    );

    return replicatedDocument ? this.toDomain(replicatedDocument) : undefined;
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
    const replicatedDocuments = await this.findReplicatedDocuments(
      (candidate) =>
        this.matchesReplicatedDiscoverableCommunity(candidate, options),
    );

    return this.deduplicateDocuments([...documents, ...replicatedDocuments])
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 50)
      .map((document) => this.toDomain(document));
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const documents = await (await this.collection())
      .find({ memberIds: identityId.valueOf() })
      .sort({ createdAt: -1 })
      .toArray();
    const replicatedDocuments = await this.findReplicatedDocuments(
      (candidate) =>
        this.arrayValue(candidate, 'memberIds')?.includes(
          identityId.valueOf(),
        ) ?? false,
    );

    return this.deduplicateDocuments([...documents, ...replicatedDocuments])
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findAll(): Promise<Community[]> {
    const documents = await (await this.collection()).find({}).toArray();
    const replicatedDocuments = await this.findReplicatedDocuments(() => true);

    return this.deduplicateDocuments([...documents, ...replicatedDocuments])
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async save(community: Community): Promise<void> {
    const document = this.toDocument(community);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
