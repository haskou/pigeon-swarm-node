import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Integer, Timestamp } from '@haskou/value-objects';

import { StickerDetails } from '../../../domain/StickerDetails';
import { StickerAssetCid } from '../../../domain/value-objects/StickerAssetCid';
import { StickerContentType } from '../../../domain/value-objects/StickerContentType';
import { StickerDimensions } from '../../../domain/value-objects/StickerDimensions';
import { StickerId } from '../../../domain/value-objects/StickerId';
import { StickerPackId } from '../../../domain/value-objects/StickerPackId';
import { StickerSize } from '../../../domain/value-objects/StickerSize';
import { StickerType } from '../../../domain/value-objects/StickerType';

export class StickerAddMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly details: StickerDetails;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly stickerId: StickerId;
  public readonly updatedAt: Timestamp;

  constructor(
    packId: string,
    actorIdentityId: string,
    details: {
      assetCid: string;
      contentType: string;
      dimensions: {
        height: number;
        width: number;
      };
      sizeBytes: number;
      type: string;
    },
    stickerId: string,
    updatedAt: number,
    mutation: unknown,
  ) {
    this.packId = new StickerPackId(packId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.stickerId = new StickerId(stickerId);
    this.updatedAt = new Timestamp(updatedAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
    const type = StickerType.fromPrimitives(details.type);

    this.details = new StickerDetails(
      type,
      new StickerAssetCid(details.assetCid),
      new StickerContentType(details.contentType),
      new StickerSize(details.sizeBytes, type),
      new StickerDimensions(
        new Integer(details.dimensions.width),
        new Integer(details.dimensions.height),
      ),
    );
  }
}
