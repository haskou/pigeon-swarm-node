import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { StickerUserLibraryRepository } from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { MongoStickerUserLibraryDocument } from './documents/MongoStickerUserLibraryDocument';

// eslint-disable-next-line max-len
export class MongoStickerUserLibraryRepository implements StickerUserLibraryRepository {
  private static readonly COLLECTION = 'sticker_user_libraries';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoStickerUserLibraryDocument>(
      MongoStickerUserLibraryRepository.COLLECTION,
    );
  }

  private toDocument(
    library: StickerUserLibrary,
  ): MongoStickerUserLibraryDocument {
    const primitives = library.toPrimitives();

    return {
      _id: primitives.identityId,
      favoriteStickers: primitives.favoriteStickers,
      recentStickers: primitives.recentStickers,
      savedPackIds: primitives.savedPackIds,
    };
  }

  private toDomain(
    document: MongoStickerUserLibraryDocument,
  ): StickerUserLibrary {
    return StickerUserLibrary.fromPrimitives({
      favoriteStickers: document.favoriteStickers,
      identityId: document._id,
      recentStickers: document.recentStickers,
      savedPackIds: document.savedPackIds,
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: identityId.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async save(library: StickerUserLibrary): Promise<void> {
    const document = this.toDocument(library);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
