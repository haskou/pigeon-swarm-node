import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerPackForgetMessage } from './messages/StickerPackForgetMessage';

export default class StickerPackForgetter {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  public async forget(
    message: StickerPackForgetMessage,
  ): Promise<StickerUserLibrary> {
    await this.repository.forgetPack(
      message.identityId,
      message.packId,
      message.proof,
    );

    return (
      (await this.repository.findByIdentityId(message.identityId)) ??
      StickerUserLibrary.create(message.identityId)
    );
  }
}
