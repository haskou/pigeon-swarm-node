import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUnfavoriteMessage } from './messages/StickerUnfavoriteMessage';

export default class StickerUnfavoriter {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  public async unfavorite(
    message: StickerUnfavoriteMessage,
  ): Promise<StickerUserLibrary> {
    await this.repository.unfavorite(
      message.identityId,
      message.packId,
      message.stickerId,
      message.proof,
    );

    return (
      (await this.repository.findByIdentityId(message.identityId)) ??
      StickerUserLibrary.create(message.identityId)
    );
  }
}
