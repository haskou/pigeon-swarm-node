import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { StickerUserLibraryViewModel } from '../view-model/StickerUserLibraryViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteFavoriteStickerRoute extends StickerRouteSupport {
  @Delete('/:packId/stickers/:stickerId/favorite')
  public async unfavoriteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pack = await this.findPack(packId);
    const library = await this.findLibrary(identityId);

    pack.assertHasSticker(new StickerId(stickerId));
    library.unfavoriteSticker(
      new StickerPackId(packId),
      new StickerId(stickerId),
    );
    await this.libraryRepository().save(library);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerUserLibraryViewModel(library, [pack]).toResource());
  }
}
