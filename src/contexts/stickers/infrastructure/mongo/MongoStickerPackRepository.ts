import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { MongoStickerPackDocument } from './documents/MongoStickerPackDocument';

export class MongoStickerPackRepository implements StickerPackRepository {
  private static readonly COLLECTION = 'sticker_packs';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoStickerPackDocument>(
      MongoStickerPackRepository.COLLECTION,
    );
  }

  private toDocument(pack: StickerPack): MongoStickerPackDocument {
    const primitives = pack.toPrimitives();

    return {
      _id: primitives.id,
      createdAt: primitives.createdAt,
      description: primitives.description,
      name: primitives.name,
      ownerIdentityId: primitives.ownerIdentityId,
      stickers: primitives.stickers,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(document: MongoStickerPackDocument): StickerPack {
    return StickerPack.fromPrimitives({
      createdAt: document.createdAt,
      description: document.description,
      id: document._id,
      name: document.name,
      ownerIdentityId: document.ownerIdentityId,
      stickers: document.stickers,
      updatedAt: document.updatedAt,
    });
  }

  public async findAll(): Promise<StickerPack[]> {
    const documents = await (await this.collection())
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findById(id: StickerPackId): Promise<StickerPack | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByOwner(
    ownerIdentityId: IdentityId,
  ): Promise<StickerPack[]> {
    const documents = await (await this.collection())
      .find({ ownerIdentityId: ownerIdentityId.valueOf() })
      .sort({ updatedAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(pack: StickerPack): Promise<void> {
    const document = this.toDocument(pack);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
