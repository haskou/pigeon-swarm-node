import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import OrbitDBReplicatedStateRegistry from '../../../shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { OrbitDBStickerPackDocument } from './documents/OrbitDBStickerPackDocument';

// eslint-disable-next-line max-len
export default class OrbitDBStickerPackRepository extends StickerPackRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBStickerPackDocument {
    return (
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.name === 'string' &&
      typeof document.ownerIdentityId === 'string' &&
      Array.isArray(document.stickers) &&
      typeof document.updatedAt === 'number'
    );
  }

  private toDocument(pack: StickerPack): OrbitDBStickerPackDocument {
    const primitives = pack.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      id: primitives.id,
      name: primitives.name,
      ownerIdentityId: primitives.ownerIdentityId,
      stickers: primitives.stickers,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(document: OrbitDBStickerPackDocument): StickerPack {
    return StickerPack.fromPrimitives(document);
  }

  private async findDocuments(
    matcher: (document: OrbitDBStickerPackDocument) => boolean,
  ): Promise<OrbitDBStickerPackDocument[]> {
    const documents = await this.registry.queryDocuments(
      'stickerPacks',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter((document): document is OrbitDBStickerPackDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  public async findAll(): Promise<StickerPack[]> {
    const documents = await this.findDocuments(() => true);

    return documents.map((document) => this.toDomain(document));
  }

  public async findById(id: StickerPackId): Promise<StickerPack | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new StickerPackId(candidate.id).isEqual(id),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findByOwner(
    ownerIdentityId: IdentityId,
  ): Promise<StickerPack[]> {
    const documents = await this.findDocuments(
      (document) => document.ownerIdentityId === ownerIdentityId.valueOf(),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async save(pack: StickerPack): Promise<void> {
    await this.registry.putDocument('stickerPacks', this.toDocument(pack));
  }
}
