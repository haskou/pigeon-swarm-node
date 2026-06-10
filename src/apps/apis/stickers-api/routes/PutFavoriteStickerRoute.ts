import { StickerFavoriteMessage } from '@app/contexts/stickers/application/favorite-sticker/messages/StickerFavoriteMessage';
import { StickerFavoriter } from '@app/contexts/stickers/application/favorite-sticker/StickerFavoriter';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PutFavoriteStickerRoute extends StickerRouteSupport {
  private readonly favoriter = this.get<StickerFavoriter>(StickerFavoriter);

  @Put('/:packId/stickers/:stickerId/favorite')
  public async favoriteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.favoriter.favorite(
      new StickerFavoriteMessage(identityId.valueOf(), packId, stickerId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
