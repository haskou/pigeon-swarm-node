import { StickerFavoriteMessage } from '@app/contexts/stickers/application/favorite-sticker/messages/StickerFavoriteMessage';
import StickerFavoriter from '@app/contexts/stickers/application/favorite-sticker/StickerFavoriter';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutFavoriteStickerBody } from '../bodies/PutFavoriteStickerBody';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PutFavoriteStickerRoute extends StickerRouteSupport {
  private readonly favoriter = this.get<StickerFavoriter>(StickerFavoriter);

  @Put('/:packId/stickers/:stickerId/favorite')
  public async favoriteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Body() body: PutFavoriteStickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.favoriter.favorite(
      new StickerFavoriteMessage(
        identityId.valueOf(),
        packId,
        stickerId,
        body.favoritedAt,
        body.mutation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
