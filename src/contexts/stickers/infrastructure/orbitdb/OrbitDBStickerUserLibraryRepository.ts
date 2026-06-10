import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { OrbitDBStickerUserLibraryDocument } from './documents/OrbitDBStickerUserLibraryDocument';

// eslint-disable-next-line max-len
export default class OrbitDBStickerUserLibraryRepository extends StickerUserLibraryRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBStickerUserLibraryDocument {
    return (
      typeof document.id === 'string' &&
      typeof document.identityId === 'string' &&
      Array.isArray(document.favoriteStickers) &&
      Array.isArray(document.recentStickers) &&
      Array.isArray(document.savedPackIds)
    );
  }

  private toDocument(
    library: StickerUserLibrary,
  ): OrbitDBStickerUserLibraryDocument {
    const primitives = library.toPrimitives();

    return {
      favoriteStickers: primitives.favoriteStickers,
      id: primitives.identityId,
      identityId: primitives.identityId,
      recentStickers: primitives.recentStickers,
      savedPackIds: primitives.savedPackIds,
    };
  }

  private toDomain(
    document: OrbitDBStickerUserLibraryDocument,
  ): StickerUserLibrary {
    return StickerUserLibrary.fromPrimitives({
      favoriteStickers: document.favoriteStickers,
      identityId: document.identityId,
      recentStickers: document.recentStickers,
      savedPackIds: document.savedPackIds,
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined> {
    const [document] = await this.registry.queryDocuments(
      'stickerUserLibraries',
      (candidate) => candidate.id === identityId.valueOf(),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async save(library: StickerUserLibrary): Promise<void> {
    await this.registry.putDocument(
      'stickerUserLibraries',
      this.toDocument(library),
    );
  }
}
