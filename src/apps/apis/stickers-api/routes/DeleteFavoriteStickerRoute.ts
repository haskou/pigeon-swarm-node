import { StickerUnfavoriteMessage } from '@app/contexts/stickers/application/unfavorite-sticker/messages/StickerUnfavoriteMessage';
import StickerUnfavoriter from '@app/contexts/stickers/application/unfavorite-sticker/StickerUnfavoriter';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteFavoriteStickerRoute extends StickerRouteSupport {
  private readonly unfavoriter =
    this.get<StickerUnfavoriter>(StickerUnfavoriter);

  @Delete('/:packId/stickers/:stickerId/favorite')
  public async unfavoriteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.unfavoriter.unfavorite(
      new StickerUnfavoriteMessage(identityId.valueOf(), packId, stickerId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
