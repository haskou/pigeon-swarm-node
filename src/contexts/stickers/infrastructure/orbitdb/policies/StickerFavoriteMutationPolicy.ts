import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

/** A favorite sticker is the private shortcut of its own identity, published to its devices. */
export default class StickerFavoriteMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'identityId', 'packId', 'stickerId'],
    ['favoritedAt'],
    'sticker_favorite',
  );

  public readonly collection = 'stickerUserLibraries';

  public readonly scopeType = 'sticker_favorite';

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = [
      'favorite',
      record.identityId,
      record.packId,
      record.stickerId,
    ].join(':');

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: record.identityId as string,
      recordId: id,
      store: this.collection,
    };
  }

  public assertPermitted(): Promise<void> {
    return Promise.resolve();
  }
}
