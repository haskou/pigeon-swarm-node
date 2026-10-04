import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

/** A recently used sticker is the usage history of its own identity, published to its devices. */
export default class StickerRecentMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'identityId', 'packId', 'stickerId'],
    ['usedAt'],
    'sticker_recent',
  );

  public readonly collection = 'stickerUserLibraries';

  public readonly scopeType = 'sticker_recent';

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = [
      'recent',
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
