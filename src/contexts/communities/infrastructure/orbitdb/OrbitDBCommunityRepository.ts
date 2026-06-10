import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

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

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityDocument {
    return (
      value.deleted !== true &&
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

  private async findDocuments(
    matcher: (document: OrbitDBCommunityDocument) => boolean,
  ): Promise<OrbitDBCommunityDocument[]> {
    const documents = await this.registry.queryDocuments(
      'communities',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter((document): document is OrbitDBCommunityDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  public async delete(community: Community): Promise<void> {
    const document = this.mapper.toDocument(community);

    await this.registry.putDocument('communities', {
      ...document,
      deleted: true,
      deletedAt: Date.now(),
    });
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new CommunityId(candidate.id).isEqual(id),
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const query = options.query?.trim();
    const regex = query ? new RegExp(this.escapeRegex(query), 'i') : undefined;
    const documents = await this.findDocuments((document) => {
      const isDiscoverable = document.discoverable ?? true;
      const networkMatches = options.networkId
        ? document.networkId === options.networkId
        : true;
      const queryMatches = regex
        ? regex.test(document.name) || regex.test(document.description)
        : true;

      return isDiscoverable && networkMatches && queryMatches;
    });

    return documents
      .slice(0, 50)
      .map((document) => this.mapper.toDomain(document));
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const documents = await this.findDocuments((document) =>
      document.memberIds.includes(identityId.valueOf()),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async findSyncable(): Promise<Community[]> {
    const documents = await this.findDocuments(() => true);

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async save(community: Community): Promise<void> {
    await this.registry.putDocument(
      'communities',
      this.mapper.toDocument(community),
    );
  }
}
