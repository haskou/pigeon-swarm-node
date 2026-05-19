import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { StickerUserLibraryViewModel } from '../view-model/StickerUserLibraryViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PutFavoriteStickerRoute extends StickerRouteSupport {
  @Put('/:packId/stickers/:stickerId/favorite')
  public async favoriteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pack = await this.findPack(packId);
    const packIdValueObject = new StickerPackId(packId);
    const stickerIdValueObject = new StickerId(stickerId);
    const library = await this.findLibrary(identityId);

    pack.assertHasSticker(stickerIdValueObject);
    library.favoriteSticker(packIdValueObject, stickerIdValueObject);
    await this.libraryRepository().save(library);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerUserLibraryViewModel(library, [pack]).toResource());
  }
}
