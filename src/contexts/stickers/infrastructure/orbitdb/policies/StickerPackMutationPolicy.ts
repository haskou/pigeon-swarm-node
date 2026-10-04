import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import { StickerPack } from '../../../domain/StickerPack';

/** A sticker pack is one whole document, authored only by its owner. */
export default class StickerPackMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'ownerIdentityId'],
    ['createdAt', 'updatedAt'],
    'sticker_pack',
    { arrays: ['stickers'], putStrings: ['name'] },
  );

  public readonly collection = 'stickerPacks';

  public readonly scopeType = 'sticker_pack';

  /** The stickers array is closed: it must survive a domain round trip unchanged. */
  private assertClosedContent(record: Record<string, unknown>): void {
    const content = { ...record };

    delete content.scopeType;

    try {
      const pack = StickerPack.fromPrimitives(
        content as ReturnType<StickerPack['toPrimitives']>,
      );

      if (
        PublicMutationProof.digestOf(pack.toPrimitives()) !==
        PublicMutationProof.digestOf(content)
      ) {
        throw new InvalidPublicMutationError();
      }
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== true) this.assertClosedContent(record);

    return {
      authorIdentityId: record.ownerIdentityId as string,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public assertPermitted(): Promise<void> {
    return Promise.resolve();
  }
}
