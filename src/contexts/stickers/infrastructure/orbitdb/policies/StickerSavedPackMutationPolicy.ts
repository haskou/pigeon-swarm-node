import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

/** A saved pack is the bookmark of its own identity, published to its devices. */
export default class StickerSavedPackMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'identityId', 'packId'],
    ['savedAt'],
    'sticker_saved_pack',
  );

  public readonly collection = 'stickerUserLibraries';

  public readonly scopeType = 'sticker_saved_pack';

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = ['saved', record.identityId, record.packId].join(':');

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
