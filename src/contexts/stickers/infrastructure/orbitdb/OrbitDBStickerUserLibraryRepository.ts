import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerId } from '../../domain/value-objects/StickerId';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { OrbitDBStickerFavoriteDocument } from './documents/OrbitDBStickerFavoriteDocument';
import { OrbitDBStickerLibraryDocument } from './documents/OrbitDBStickerLibraryDocument';
import { OrbitDBStickerRecentDocument } from './documents/OrbitDBStickerRecentDocument';
import { OrbitDBStickerSavedPackDocument } from './documents/OrbitDBStickerSavedPackDocument';

const TIMESTAMP_FIELDS: Record<string, string> = {
  sticker_favorite: 'favoritedAt',
  sticker_recent: 'usedAt',
  sticker_saved_pack: 'savedAt',
};

export default class OrbitDBStickerUserLibraryRepository extends StickerUserLibraryRepository {
  private readonly libraryIndex: OrbitDBHeadIndex<OrbitDBStickerLibraryDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.libraryIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'stickerUserLibraries',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private headKey(identityId: IdentityId): string {
    return `sticker-user-library:${identityId.valueOf()}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBStickerLibraryDocument {
    const timestampField = TIMESTAMP_FIELDS[String(document.scopeType)];
    const needsSticker = document.scopeType !== 'sticker_saved_pack';

    return (
      timestampField !== undefined &&
      document.removed !== true &&
      typeof document.id === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.packId === 'string' &&
      typeof document[timestampField] === 'number' &&
      (!needsSticker || typeof document.stickerId === 'string')
    );
  }

  private async write(
    identityId: IdentityId,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);
    const key = this.headKey(identityId);

    PublicMutationRecord.assertNotStale(
      (await this.libraryIndex.findRecords(key)).filter(
        (stored) => stored.id === payload.id,
      ),
      document,
    );
    await this.registry.putDocument('stickerUserLibraries', document);
    await this.libraryIndex.putRecord(
      key,
      { id: key, identityId: identityId.valueOf() },
      document,
    );
  }

  public async favorite(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    favoritedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        favoritedAt: favoritedAt.valueOf(),
        id: `favorite:${identityId.valueOf()}:${packId.valueOf()}:${stickerId.valueOf()}`,
        identityId: identityId.valueOf(),
        packId: packId.valueOf(),
        scopeType: 'sticker_favorite',
        stickerId: stickerId.valueOf(),
      },
      proof,
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined> {
    const documents = await this.libraryIndex.find(this.headKey(identityId));

    if (!documents) return undefined;

    const own = documents.filter(
      (document) => document.identityId === identityId.valueOf(),
    );

    return StickerUserLibrary.fromPrimitives({
      favoriteStickers: own
        .filter(
          (document): document is OrbitDBStickerFavoriteDocument =>
            document.scopeType === 'sticker_favorite',
        )
        .map(({ favoritedAt, packId, stickerId }) => ({
          favoritedAt,
          packId,
          stickerId,
        })),
      identityId: identityId.valueOf(),
      recentStickers: own
        .filter(
          (document): document is OrbitDBStickerRecentDocument =>
            document.scopeType === 'sticker_recent',
        )
        .map(({ packId, stickerId, usedAt }) => ({
          packId,
          stickerId,
          usedAt,
        })),
      savedPackIds: own
        .filter(
          (document): document is OrbitDBStickerSavedPackDocument =>
            document.scopeType === 'sticker_saved_pack',
        )
        .sort((left, right) => left.savedAt - right.savedAt)
        .map((document) => document.packId),
    });
  }

  public async forgetPack(
    identityId: IdentityId,
    packId: StickerPackId,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        id: `saved:${identityId.valueOf()}:${packId.valueOf()}`,
        identityId: identityId.valueOf(),
        packId: packId.valueOf(),
        removed: true,
        scopeType: 'sticker_saved_pack',
      },
      proof,
    );
  }

  public async recordUse(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    usedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        id: `recent:${identityId.valueOf()}:${packId.valueOf()}:${stickerId.valueOf()}`,
        identityId: identityId.valueOf(),
        packId: packId.valueOf(),
        scopeType: 'sticker_recent',
        stickerId: stickerId.valueOf(),
        usedAt: usedAt.valueOf(),
      },
      proof,
    );
  }

  public async savePack(
    identityId: IdentityId,
    packId: StickerPackId,
    savedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        id: `saved:${identityId.valueOf()}:${packId.valueOf()}`,
        identityId: identityId.valueOf(),
        packId: packId.valueOf(),
        savedAt: savedAt.valueOf(),
        scopeType: 'sticker_saved_pack',
      },
      proof,
    );
  }

  public async unfavorite(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      identityId,
      {
        id: `favorite:${identityId.valueOf()}:${packId.valueOf()}:${stickerId.valueOf()}`,
        identityId: identityId.valueOf(),
        packId: packId.valueOf(),
        removed: true,
        scopeType: 'sticker_favorite',
        stickerId: stickerId.valueOf(),
      },
      proof,
    );
  }
}
